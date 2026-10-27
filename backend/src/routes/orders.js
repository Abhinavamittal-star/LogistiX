const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { store } = require('../data/demoStore');
const { getIO } = require('../socket');
const { v4: uuidv4 } = require('uuid');
const { isDemoMode } = require('../config/db');

const isMongo = req => !isDemoMode(req);
const userId = user => String(user._id || user.id);
const findDemoOrder = id => store.getOrder(id);
const isDemoOwner = (order, user) => String(order.customerId) === userId(user);

function emitOrder(event, order, demoMode) {
  const io = getIO();
  if (!io || !order) return;
  const trackingCode = order.trackingCode;
  const orderId = order.orderId || String(order._id);
  io.to(demoMode ? 'dispatcher:demo' : 'dispatcher').emit(event, order);
  if (trackingCode) io.to(`shipment:${demoMode ? 'demo:' : ''}${trackingCode}`).emit(event, toPublicOrder(order));
  io.to(`shipment:${demoMode ? 'demo:' : ''}${orderId}`).emit(event, order);
  if (order.customerId) {
    io.to(`customer:${demoMode ? 'demo:' : ''}${String(order.customerId._id || order.customerId)}`).emit(event, order);
  }
  if (order.assignedDriver) {
    const driverId = String(order.assignedDriver._id || order.assignedDriver);
    io.to(`driver:${driverId}`).emit(event === 'order:created' ? 'order:assigned' : event, order);
  }
}

function toPublicOrder(order) {
  const plain = order.toObject ? order.toObject() : order;
  return {
    _id: plain._id,
    orderId: plain.orderId,
    trackingCode: plain.trackingCode,
    status: plain.status,
    pickup: publicLocation(plain.pickup),
    delivery: publicLocation(plain.delivery),
    eta: plain.eta,
    assignedDriver: plain.assignedDriver ? { name: plain.assignedDriver.name } : null,
    statusHistory: (plain.statusHistory || []).map(({ status, timestamp }) => ({ status, timestamp })),
    isDelayed: plain.isDelayed,
    updatedAt: plain.updatedAt,
  };
}

function publicLocation(location) {
  if (!location) return null;
  return {
    address: location.address,
    location: location.location
  };
}

router.get('/', protect, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role === 'driver') filter.assignedDriver = userId(req.user);
    if (req.user.role === 'customer') filter.customerId = userId(req.user);
    if (req.user.role === 'dispatcher' && req.query.driver) filter.assignedDriver = req.query.driver;
    const result = isMongo(req)
      ? await require('../models/Order').find(filter).populate('assignedDriver', 'name email phone').sort({ createdAt: -1 }).limit(limit).skip(skip)
      : store.getOrders(filter).slice(skip, skip + limit);
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/stats', protect, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'driver') filter.assignedDriver = userId(req.user);
    if (req.user.role === 'customer') filter.customerId = userId(req.user);
    const orders = isMongo(req) ? await require('../models/Order').find(filter).select('status isDelayed') : store.getOrders(filter);
    res.json({
      total: orders.length,
      pending: orders.filter(order => order.status === 'pending').length,
      inTransit: orders.filter(order => ['assigned', 'picked_up', 'in_transit'].includes(order.status)).length,
      delivered: orders.filter(order => order.status === 'delivered').length,
      failed: orders.filter(order => order.status === 'failed').length,
      delayed: orders.filter(order => order.isDelayed).length,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id/public', async (req, res) => {
  try {
    const mongoOrder = isMongo()
      ? await require('../models/Order').findOne({ trackingCode: req.params.id }).populate('assignedDriver', 'name')
      : null;
    const demoOrder = mongoOrder ? null : store.getOrders().find(item => item.trackingCode === req.params.id);
    const order = mongoOrder || demoOrder;
    const fromDemoStore = Boolean(demoOrder) || isDemoMode();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const publicOrder = toPublicOrder(order);
    const plain = order.toObject ? order.toObject() : order;
    let vehicle = null;
    if (plain.assignedDriver && !fromDemoStore) {
      const activeVehicle = await require('../models/Vehicle').findOne(
        plain.assignedVehicle ? { _id: plain.assignedVehicle } : { driver: plain.assignedDriver._id }
      ).select('vehicleId currentLocation trail color');
      if (activeVehicle) vehicle = activeVehicle;
    } else if (plain.assignedDriver) {
      const assignedDriverId = String(plain.assignedDriver._id || plain.assignedDriver);
      const demoVehicle = store.getVehicles().find(item => String(item.driverId || item.driver?._id) === assignedDriverId);
      if (demoVehicle) {
        vehicle = { vehicleId: demoVehicle.vehicleId, currentLocation: demoVehicle.currentLocation };
        publicOrder.assignedDriver = { name: demoVehicle.driver?.name || 'Driver' };
      }
    }
    if (vehicle) vehicle = { vehicleId: vehicle.vehicleId, currentLocation: vehicle.currentLocation };
    res.json({ ...publicOrder, vehicle });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    let order = isMongo(req)
      ? await require('../models/Order').findOne({
        $or: [{ _id: mongoose.isValidObjectId(req.params.id) ? req.params.id : null }, { orderId: req.params.id }, { trackingCode: req.params.id }]
      }).populate('assignedDriver', 'name email phone')
      : findDemoOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'customer' && (isMongo(req) ? String(order.customerId) !== userId(req.user) : !isDemoOwner(order, req.user))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'driver' && String(order.assignedDriver?._id || order.assignedDriver) !== userId(req.user)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', protect, authorize('dispatcher', 'customer'), async (req, res) => {
  try {
    const { pickup, delivery, customerName, customerEmail, customerPhone, priority, weight, eta } = req.body;
    if (!pickup?.address || !Array.isArray(pickup.location?.coordinates) || !delivery?.address || !Array.isArray(delivery.location?.coordinates)) {
      return res.status(400).json({ error: 'Pickup and delivery addresses with [longitude, latitude] coordinates are required' });
    }
    const coordinates = [...pickup.location.coordinates, ...delivery.location.coordinates];
    if (coordinates.some(value => !Number.isFinite(Number(value))) || Math.abs(Number(pickup.location.coordinates[0])) > 180 || Math.abs(Number(delivery.location.coordinates[0])) > 180 || Math.abs(Number(pickup.location.coordinates[1])) > 90 || Math.abs(Number(delivery.location.coordinates[1])) > 90) {
      return res.status(400).json({ error: 'Coordinates must be valid longitude and latitude values' });
    }
    const orderData = {
      pickup, delivery, priority, weight: Number(weight) || 0,
      customerName: req.user.role === 'customer' ? req.user.name : customerName,
      customerEmail: req.user.role === 'customer' ? req.user.email : customerEmail,
      customerPhone, eta: eta ? new Date(eta) : undefined,
      customerId: userId(req.user),
      trackingCode: `TRK${uuidv4().replace(/-/g, '').toUpperCase()}`,
      orderId: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`
    };
    const order = isMongo(req) ? await require('../models/Order').create(orderData) : store.createOrder(orderData);
    emitOrder('order:created', order, isDemoMode(req));
    res.status(201).json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/:id', protect, authorize('dispatcher', 'driver'), async (req, res) => {
  try {
    const { status, note, ...otherUpdates } = req.body;
    if (req.user.role === 'driver' && Object.keys(otherUpdates).length) {
      return res.status(403).json({ error: 'Drivers may only update delivery status' });
    }
    const Order = require('../models/Order');
    let order;
    if (req.user.role === 'driver') {
      const allowedStatuses = {
        picked_up: ['assigned'],
        in_transit: ['picked_up', 'in_transit'],
        failed: ['assigned', 'picked_up', 'in_transit']
      };
      if (!allowedStatuses[status]) return res.status(400).json({ error: 'Invalid driver status transition' });
    }
    if (isMongo(req)) {
      const filter = { _id: req.params.id };
      if (req.user.role === 'driver') {
        filter.assignedDriver = userId(req.user);
        filter.status = { $in: {
          picked_up: ['assigned'],
          in_transit: ['picked_up', 'in_transit'],
          failed: ['assigned', 'picked_up', 'in_transit']
        }[status] };
      }
      const update = { ...otherUpdates };
      if (status) {
        update.status = status;
        if (status === 'picked_up') update.pickedUpAt = new Date();
        update.$push = { statusHistory: { status, timestamp: new Date(), note: note || '' } };
      }
      order = await Order.findOneAndUpdate(filter, update, { new: true, runValidators: true }).populate('assignedDriver', 'name email phone');
    } else {
      order = findDemoOrder(req.params.id);
      if (order && req.user.role === 'driver' && String(order.assignedDriver?._id || order.assignedDriver) !== userId(req.user)) return res.status(403).json({ error: 'Access denied' });
      if (order && req.user.role === 'driver' && !{
        picked_up: ['assigned'],
        in_transit: ['picked_up', 'in_transit'],
        failed: ['assigned', 'picked_up', 'in_transit']
      }[status]?.includes(order.status)) {
        return res.status(409).json({ error: `Cannot change order from ${order.status} to ${status}` });
      }
      if (order) {
        order = store.updateOrder(req.params.id, { ...otherUpdates, ...(status ? { status, ...(status === 'picked_up' ? { pickedUpAt: new Date() } : {}), statusHistory: [...(order.statusHistory || []), { status, timestamp: new Date(), note: note || '' }] } : {}) });
      }
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    emitOrder('order:updated', order, isDemoMode(req));
    res.json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/:id', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const order = isMongo(req)
      ? await require('../models/Order').findByIdAndDelete(req.params.id)
      : store.deleteOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    emitOrder('order:deleted', order, isDemoMode(req));
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/assign', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const { driverId, vehicleId } = req.body;
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });
    let order;
    if (isMongo(req)) {
      const driver = await require('../models/User').findOne({ _id: driverId, role: 'driver', isActive: true });
      if (!driver) return res.status(400).json({ error: 'A valid active driver is required' });
      if (vehicleId && !await require('../models/Vehicle').exists({ _id: vehicleId, driver: driverId })) {
        return res.status(400).json({ error: 'Vehicle must be registered to the selected driver' });
      }
      order = await require('../models/Order').findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'assigned'] } }, {
        assignedDriver: driverId, assignedVehicle: vehicleId || null, status: 'assigned',
        $push: { statusHistory: { status: 'assigned', timestamp: new Date() } }
      }, { new: true, runValidators: true }).populate('assignedDriver', 'name email');
    } else {
      const current = findDemoOrder(req.params.id);
      const vehicle = vehicleId && store.getVehicles().find(item => item._id === vehicleId || item.vehicleId === vehicleId);
      if (vehicleId && (!vehicle || String(vehicle.driverId || vehicle.driver?._id) !== String(driverId))) {
        return res.status(400).json({ error: 'Vehicle must be registered to the selected driver' });
      }
      order = current && ['pending', 'assigned'].includes(current.status)
        ? store.updateOrder(req.params.id, {
          assignedDriver: driverId, assignedVehicle: vehicle?._id, status: 'assigned',
          statusHistory: [...(current.statusHistory || []), { status: 'assigned', timestamp: new Date() }]
        })
        : null;
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    emitOrder('order:updated', order, isDemoMode(req));
    res.json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/deliver', protect, authorize('driver'), async (req, res) => {
  try {
    const { signature, photo, notes } = req.body;
    if (typeof signature !== 'string' || !signature.startsWith('data:image/')) return res.status(400).json({ error: 'A valid signature image is required' });
    if (signature.length > 500000 || (photo && photo.length > 7_000_000)) return res.status(413).json({ error: 'Proof of delivery exceeds the supported size' });
    let order;
    if (isMongo(req)) {
      order = await require('../models/Order').findOneAndUpdate(
        { _id: req.params.id, assignedDriver: userId(req.user), status: { $in: ['picked_up', 'in_transit'] } },
        { status: 'delivered', deliveredAt: new Date(), proofOfDelivery: { signature, photo, notes, capturedAt: new Date() }, $push: { statusHistory: { status: 'delivered', timestamp: new Date(), note: notes || '' } } },
        { new: true, runValidators: true }
      ).populate('assignedDriver', 'name email');
    } else {
      const current = findDemoOrder(req.params.id);
      if (current && String(current.assignedDriver?._id || current.assignedDriver) !== userId(req.user)) return res.status(403).json({ error: 'Access denied' });
      order = current && ['picked_up', 'in_transit'].includes(current.status) ? store.updateOrder(req.params.id, {
        status: 'delivered', deliveredAt: new Date(), proofOfDelivery: { signature, photo, notes, capturedAt: new Date() },
        statusHistory: [...(current.statusHistory || []), { status: 'delivered', timestamp: new Date(), note: notes || '' }]
      }) : null;
    }
    if (!order) return res.status(404).json({ error: 'Assigned active order not found' });
    emitOrder('order:delivered', order, isDemoMode(req));
    res.json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
