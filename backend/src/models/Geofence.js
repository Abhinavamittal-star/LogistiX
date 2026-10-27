const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  description: String,
  
  // GeoJSON Polygon
  geometry: {
    type: { type: String, enum: ['Polygon'], required: true },
    coordinates: { type: [[[Number]]], required: true }
  },
  
  color: { type: String, default: '#f97316' },
  opacity: { type: Number, default: 0.2 },
  
  alertOnEnter: { type: Boolean, default: true },
  alertOnExit: { type: Boolean, default: true },
  
  isActive: { type: Boolean, default: true },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Stats
  breachCount: { type: Number, default: 0 },
  
  breachHistory: [{
    vehicleId: mongoose.Schema.Types.ObjectId,
    type: { type: String, enum: ['enter', 'exit'] },
    timestamp: Date,
    location: [Number]
  }]
}, {
  timestamps: true
});

geofenceSchema.index({ geometry: '2dsphere' });

module.exports = mongoose.model('Geofence', geofenceSchema);
