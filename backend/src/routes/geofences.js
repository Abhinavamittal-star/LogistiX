const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { store } = require('../data/demoStore');
const { isDemoMode } = require('../config/db');

const tryMongo = async (req, mongoFn, fallbackFn) => {
  if (isDemoMode(req)) return fallbackFn();
  return mongoFn();
};

// GET /api/geofences
router.get('/', protect, async (req, res) => {
  try {
    const result = await tryMongo(req,
      async () => {
        const Geofence = require('../models/Geofence');
        return await Geofence.find({}).sort({ createdAt: -1 });
      },
      () => store.getGeofences()
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/geofences
router.post('/', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const { name, geometry } = req.body;
    if (!name?.trim() || geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0]) || geometry.coordinates[0].length < 4) {
      return res.status(400).json({ error: 'A name and GeoJSON Polygon with at least four boundary points are required' });
    }
    const ring = geometry.coordinates[0];
    if (ring.some(point => !Array.isArray(point) || point.length !== 2 ||
      !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1])) ||
      Math.abs(Number(point[0])) > 180 || Math.abs(Number(point[1])) > 90)) {
      return res.status(400).json({ error: 'Polygon boundary must contain valid [longitude, latitude] coordinates' });
    }
    if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) {
      return res.status(400).json({ error: 'The polygon boundary must be closed by repeating its first coordinate' });
    }
    const result = await tryMongo(req,
      async () => {
        const Geofence = require('../models/Geofence');
        return await Geofence.create({ ...req.body, name: name.trim(), createdBy: req.user._id || req.user.id });
      },
      () => store.createGeofence({ ...req.body, name: name.trim(), createdBy: req.user._id || req.user.id })
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/geofences/:id
router.delete('/:id', protect, authorize('dispatcher'), async (req, res) => {
  try {
    const deleted = await tryMongo(req,
      async () => {
        const Geofence = require('../models/Geofence');
        return Geofence.findByIdAndDelete(req.params.id);
      },
      () => store.deleteGeofence(req.params.id)
    );
    if (!deleted) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geofences/alerts
router.get('/alerts', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const alerts = await tryMongo(req,
      () => require('../models/Alert').find({}).sort({ timestamp: -1 }).limit(safeLimit),
      () => store.getAlerts(safeLimit)
    );
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
