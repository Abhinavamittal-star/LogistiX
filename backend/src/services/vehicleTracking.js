const mongoose = require('mongoose');
const { store } = require('../data/demoStore');
const { getIO } = require('../socket');
const { checkGeofenceTransitions } = require('./geofence');
const { haversineDistance } = require('./routeOptimizer');
const { isDemoMode } = require('../config/db');

const etaRefreshTimes = new Map();

async function recalculateEtas(vehicle, coordinates, speed, demoMode) {
  const driverId = String(vehicle.driver?._id || vehicle.driverId || vehicle.driver || '');
  if (!driverId) return;
  const nowMs = Date.now();
  if (nowMs - (etaRefreshTimes.get(driverId) || 0) < 15000) return;
  etaRefreshTimes.set(driverId, nowMs);
  const useDemo = isDemoMode({ demoMode });
  const isMongo = !useDemo;
  const orders = isMongo
    ? await require('../models/Order').find({ assignedDriver: driverId, status: { $in: ['assigned', 'picked_up', 'in_transit'] } })
    : store.getOrders({ assignedDriver: driverId }).filter(order => ['assigned', 'picked_up', 'in_transit'].includes(order.status));
  const averageSpeed = Math.max(Number(speed) || Number(vehicle.currentLocation?.speed) || 30, 5);
  const io = getIO();
  for (const order of orders) {
    const pickup = order.pickup?.location?.coordinates;
    const delivery = order.delivery?.location?.coordinates;
    if (!delivery || delivery.length !== 2) continue;
    let remainingKm = haversineDistance(coordinates, delivery);
    if (order.status === 'assigned' && pickup?.length === 2) remainingKm += haversineDistance(coordinates, pickup);
    const eta = new Date(Date.now() + remainingKm / averageSpeed * 60 * 60 * 1000);
    const deadline = order.delivery?.scheduledAt ? new Date(order.delivery.scheduledAt) : null;
    const updates = {
      eta,
      estimatedDistance: Math.round(remainingKm * 10) / 10,
      estimatedDuration: Math.round(remainingKm / averageSpeed * 60),
      isDelayed: Boolean(deadline && eta > deadline),
      delayMinutes: deadline && eta > deadline ? Math.ceil((eta - deadline) / 60000) : 0
    };
    const updated = isMongo
      ? await require('../models/Order').findByIdAndUpdate(order._id, updates, { new: true }).populate('assignedDriver', 'name')
      : store.updateOrder(order._id, updates);
    if (updated && io) {
      io.to(useDemo ? 'dispatcher:demo' : 'dispatcher').emit('order:updated', updated);
      if (updated.trackingCode) io.to(`shipment:${useDemo ? 'demo:' : ''}${updated.trackingCode}`).emit('order:updated', updated);
      if (updated.customerId) {
        io.to(`customer:${useDemo ? 'demo:' : ''}${String(updated.customerId._id || updated.customerId)}`).emit('order:updated', updated);
      }
    }
  }
}

async function updateVehicleLocation({ vehicleId, driverId, coordinates, speed = 0, heading = 0, demoMode = false }) {
  let vehicle;
  const useDemo = isDemoMode({ demoMode });
  if (!useDemo) {
    const filter = {};
    if (vehicleId) filter.vehicleId = vehicleId;
    if (driverId && mongoose.isValidObjectId(driverId)) filter.driver = driverId;
    if (!Object.keys(filter).length) return null;
    vehicle = await require('../models/Vehicle').findOne(filter);
    if (!vehicle) return null;
    vehicle.addTrailPoint(coordinates, speed, heading);
    vehicle.currentLocation = { type: 'Point', coordinates, heading, speed };
    vehicle.lastHeartbeat = new Date();
    vehicle.status = 'en_route';
    await vehicle.save();
  } else {
    const ownedVehicle = driverId
      ? store.getVehicles().find(item =>
        String(item.driverId || item.driver?._id) === String(driverId) &&
        (!vehicleId || String(item.vehicleId) === String(vehicleId)))
      : store.getVehicle(vehicleId);
    vehicle = ownedVehicle
      ? store.updateVehicleLocation(ownedVehicle.vehicleId, coordinates, speed, heading)
      : null;
    if (!vehicle) return null;
  }
  await checkGeofenceTransitions(coordinates, vehicle, { demoMode: useDemo });
  await recalculateEtas(vehicle, coordinates, speed, useDemo);
  return vehicle;
}

async function broadcastVehicleLocation(vehicle, { vehicleId, driverId, coordinates, speed, heading, trail, demoMode = false }) {
  const io = getIO();
  if (!io) return;
  const useDemo = isDemoMode({ demoMode });
  const payload = {
    vehicleId: vehicle?.vehicleId || vehicleId || driverId,
    driverId: driverId || String(vehicle?.driver || ''),
    coordinates,
    speed,
    heading,
    timestamp: new Date().toISOString(),
    trail: trail || vehicle?.trail || []
  };
  io.to(useDemo ? 'dispatcher:demo' : 'dispatcher').emit('vehicle:move', payload);
  if (vehicle) {
    const activeOrders = !useDemo
      ? await require('../models/Order').find({ assignedDriver: vehicle.driver, status: { $in: ['assigned', 'picked_up', 'in_transit'] } }).select('trackingCode')
      : store.getOrders().filter(order => String(order.assignedDriver?._id || order.assignedDriver) === String(vehicle.driverId || vehicle.driver) && ['assigned', 'picked_up', 'in_transit'].includes(order.status));
    for (const order of activeOrders) {
      if (order.trackingCode) {
        const { driverId: _driverId, trail: _trail, ...publicPayload } = payload;
        io.to(`shipment:${useDemo ? 'demo:' : ''}${order.trackingCode}`).emit('vehicle:move', publicPayload);
      }
    }
  }
}

module.exports = { updateVehicleLocation, broadcastVehicleLocation };
