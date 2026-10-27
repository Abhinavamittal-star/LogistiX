const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: { type: String, required: true },
  subtype: String,
  severity: { type: String, default: 'warning' },
  message: { type: String, required: true },
  vehicleId: String,
  geofenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Geofence' },
  geofenceName: String,
  location: [Number],
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

alertSchema.index({ timestamp: -1 });
module.exports = mongoose.model('Alert', alertSchema);
