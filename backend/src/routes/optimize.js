const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { store } = require('../data/demoStore');
const { getIO } = require('../socket');
const { optimizeAssignments, orderCoordinate } = require('../services/routeOptimizer');
const { isDemoMode } = require('../config/db');

router.post('/', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const { orderIds, driverIds } = req.body;
    if (!Array.isArray(orderIds) || !orderIds.length || !Array.isArray(driverIds) || !driverIds.length || orderIds.length > 200 || driverIds.length > 50) {
      return res.status(400).json({ error: 'Select 1–200 orders and 1–50 drivers' });
    }
    const orders = !isDemoMode(req)
      ? await require('../models/Order').find({
        $or: [
          { _id: { $in: orderIds.filter(mongoose.isValidObjectId) } },
          { orderId: { $in: orderIds } }
        ],
        status: { $in: ['pending', 'assigned'] }
      }).lean()
      : store.getOrders().filter(order => orderIds.includes(order._id) || orderIds.includes(order.orderId));
    if (!orders.length) return res.status(400).json({ error: 'No valid pending orders found' });
    if (orders.some(order => !orderCoordinate(order) || orderCoordinate(order).length !== 2)) {
      return res.status(400).json({ error: 'Every selected order needs valid delivery coordinates' });
    }

    let drivers;
    if (!isDemoMode(req)) {
      const vehicles = await require('../models/Vehicle').find({ driver: { $in: driverIds } }).populate('driver', 'name email');
      drivers = vehicles.map(vehicle => ({
        driverId: String(vehicle.driver._id),
        driverName: vehicle.driver.name,
        vehicleId: String(vehicle._id),
        startCoord: vehicle.currentLocation?.coordinates?.length === 2 ? vehicle.currentLocation.coordinates : [77.5946, 12.9716]
      }));
    } else {
      drivers = driverIds.map(driverId => {
        const vehicle = store.getVehicles().find(item => String(item.driverId || item.driver?._id) === String(driverId));
        return { driverId, driverName: vehicle?.driver?.name || 'Driver', vehicleId: vehicle?._id, startCoord: vehicle?.currentLocation?.coordinates || [77.5946, 12.9716] };
      });
    }
    drivers = drivers.filter(driver => driver.driverId);
    if (!drivers.length) return res.status(400).json({ error: 'No registered vehicles were found for the selected drivers' });

    const result = optimizeAssignments(orders, drivers);
    for (const assignment of result.assignments) {
      for (const order of assignment.orders) {
        if (!isDemoMode(req)) {
          await require('../models/Order').findByIdAndUpdate(order._id, {
            assignedDriver: assignment.driver.driverId,
            assignedVehicle: assignment.driver.vehicleId || null,
            status: 'assigned',
            routeSequence: order.routeSequence,
            $push: { statusHistory: { status: 'assigned', timestamp: new Date(), note: 'Assigned by route optimizer' } }
          }, { runValidators: true });
        } else {
          store.updateOrder(order._id, { assignedDriver: assignment.driver.driverId, status: 'assigned', routeSequence: order.routeSequence });
        }
      }
    }
    if (getIO()) getIO().to(isDemoMode(req) ? 'dispatcher:demo' : 'dispatcher').emit('orders:optimized', result.assignments);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
