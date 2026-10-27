const { store } = require('../data/demoStore');
const { getIO } = require('../socket');
const { isDemoMode } = require('../config/db');

function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

async function checkGeofenceTransitions(coordinates, vehicle, { demoMode = false } = {}) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || coordinates.some(value => !Number.isFinite(Number(value)))) return [];
  const useDemo = isDemoMode({ demoMode });
  const geofences = !useDemo
    ? await require('../models/Geofence').find({ isActive: true })
    : store.getGeofences().filter(zone => zone.isActive);
  const previous = new Set((vehicle.activeGeofences || []).map(id => String(id._id || id)));
  const currentZones = geofences.filter(zone => {
    const ring = zone.geometry?.coordinates?.[0];
    return ring?.length >= 4 && pointInPolygon(coordinates, ring);
  });
  const current = new Set(currentZones.map(zone => String(zone._id)));
  const transitions = [
    ...currentZones.filter(zone => !previous.has(String(zone._id))).map(zone => ({ zone, subtype: 'enter' })),
    ...geofences.filter(zone => previous.has(String(zone._id)) && !current.has(String(zone._id))).map(zone => ({ zone, subtype: 'exit' })),
  ];

  vehicle.activeGeofences = [...current];
  if (vehicle.save && typeof vehicle.save === 'function') await vehicle.save();
  else vehicle.activeGeofences = [...current];

  const io = getIO();
  const alerts = [];
  for (const { zone, subtype } of transitions) {
    if ((subtype === 'enter' && zone.alertOnEnter === false) || (subtype === 'exit' && zone.alertOnExit === false)) continue;
    const alert = {
      type: 'geofence',
      subtype,
      severity: subtype === 'enter' ? 'warning' : 'info',
      vehicleId: vehicle.vehicleId || 'unknown',
      geofenceId: zone._id,
      geofenceName: zone.name,
      location: coordinates,
      message: `Vehicle ${subtype === 'enter' ? 'entered' : 'exited'} "${zone.name}"`,
      timestamp: new Date()
    };
    if (!useDemo) {
      await require('../models/Alert').create(alert);
      await require('../models/Geofence').updateOne({ _id: zone._id }, {
        $inc: { breachCount: 1 },
        $push: { breachHistory: { vehicleId: vehicle._id, type: subtype, timestamp: alert.timestamp, location: coordinates } }
      });
    } else {
      store.addAlert(alert);
      zone.breachCount = (zone.breachCount || 0) + 1;
    }
    if (io) io.to(useDemo ? 'dispatcher:demo' : 'dispatcher').emit('alert:geofence', alert);
    alerts.push(alert);
  }
  return alerts;
}

module.exports = { checkGeofenceTransitions, pointInPolygon };
