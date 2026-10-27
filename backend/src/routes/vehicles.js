const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { store } = require('../data/demoStore');
const { getIO } = require('../socket');
const mongoose = require('mongoose');
const { updateVehicleLocation, broadcastVehicleLocation } = require('../services/vehicleTracking');
const { isDemoMode } = require('../config/db');

const tryMongo = async (req, mongoFn, fallbackFn) => {
  if (isDemoMode(req)) return fallbackFn();
  return mongoFn();
};

// GET /api/vehicles — all vehicle positions
router.get('/', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const result = await tryMongo(req,
      async () => {
        const Vehicle = require('../models/Vehicle');
        return await Vehicle.find({})
          .populate('driver', 'name email phone')
          .select('-positionHistory');
      },
      () => store.getVehicles()
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vehicles/:id — single vehicle
router.get('/:id', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const result = await tryMongo(req,
      async () => {
        const Vehicle = require('../models/Vehicle');
        return await Vehicle.findOne({
          $or: [
            ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
            { vehicleId: req.params.id }
          ]
        }).populate('driver', 'name email');
      },
      () => store.getVehicle(req.params.id)
    );
    if (!result) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vehicles/:id/playback — position history for playback
router.get('/:id/playback', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    const result = await tryMongo(req,
      async () => {
        const Vehicle = require('../models/Vehicle');
        const v = await Vehicle.findOne({ vehicleId: req.params.id });
        if (!v) return null;
        let history = v.positionHistory || [];
        if (from) history = history.filter(p => new Date(p.timestamp) >= new Date(from));
        if (to) history = history.filter(p => new Date(p.timestamp) <= new Date(to));
        return history;
      },
      () => {
        const v = store.getVehicle(req.params.id);
        return v ? (v.trail || []) : [];
      }
    );
    
    res.json(result || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicles/heartbeat — driver location update
router.post('/heartbeat', protect, authorize('driver'), async (req, res) => {
  try {
    const { vehicleId, coordinates, speed, heading } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || coordinates.some(value => !Number.isFinite(Number(value))) || Math.abs(Number(coordinates[0])) > 180 || Math.abs(Number(coordinates[1])) > 90) {
      return res.status(400).json({ error: 'coordinates must be a valid [longitude, latitude] pair' });
    }
    const driverId = req.user._id?.toString() || req.user.id;
    const demoMode = isDemoMode(req);
    const updatedVehicle = await updateVehicleLocation({ vehicleId, driverId, coordinates: coordinates.map(Number), speed: Number(speed) || 0, heading: Number(heading) || 0, demoMode });
    if (!updatedVehicle) return res.status(404).json({ error: 'No vehicle is registered to this driver' });
    await broadcastVehicleLocation(updatedVehicle, { vehicleId, driverId, coordinates, speed: Number(speed) || 0, heading: Number(heading) || 0, demoMode });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicles — create/register vehicle (dispatcher)
router.post('/', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const { vehicleId, driverId, type, plateNumber, capacity } = req.body;
    if (!vehicleId || !driverId) return res.status(400).json({ error: 'vehicleId and driverId are required' });
    let result;
    if (!isDemoMode(req)) {
      const driver = await require('../models/User').findOne({ _id: driverId, role: 'driver' });
      if (!driver) return res.status(400).json({ error: 'A valid driver account is required' });
      result = await require('../models/Vehicle').create({ vehicleId, driver: driverId, type, plateNumber, capacity, status: 'idle', currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] } });
    } else {
      if (store.getVehicle(vehicleId)) return res.status(409).json({ error: 'Vehicle ID already exists' });
      const driver = store.getVehicles().find(vehicle => String(vehicle.driverId || vehicle.driver?._id) === String(driverId))?.driver;
      result = {
        _id: `vehicle_${Date.now()}`, vehicleId, driverId,
        driver: driver || { _id: driverId, name: 'Driver' },
        type: type || 'van', plateNumber, capacity, trail: [], activeGeofences: [],
        currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
        status: 'idle', createdAt: new Date()
      };
      store.vehicles.push(result);
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
