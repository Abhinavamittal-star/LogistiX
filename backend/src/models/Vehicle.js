const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    unique: true,
    required: true
  },
  
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Current position
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number], // [lng, lat]
    heading: { type: Number, default: 0 }, // degrees
    speed: { type: Number, default: 0 }, // km/h
    altitude: { type: Number, default: 0 }
  },
  
  // Trail — last N positions for the glowing trail
  trail: [{
    coordinates: [Number], // [lng, lat]
    timestamp: Date,
    speed: Number,
    heading: Number
  }],
  
  // Full historical positions (for playback)
  positionHistory: [{
    coordinates: [Number],
    timestamp: Date,
    speed: Number,
    heading: Number,
    orderId: String
  }],
  
  status: {
    type: String,
    enum: ['offline', 'idle', 'en_route', 'at_pickup', 'at_delivery'],
    default: 'offline'
  },
  
  isSimulated: { type: Boolean, default: false },
  
  // Vehicle info
  plateNumber: String,
  type: {
    type: String,
    enum: ['van', 'truck', 'motorcycle', 'car'],
    default: 'van'
  },
  capacity: Number, // kg
  color: String, // hex for map marker
  
  // Active orders
  activeOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  
  // Stats
  totalDistance: { type: Number, default: 0 }, // km today
  deliveriesCompleted: { type: Number, default: 0 },
  
  lastHeartbeat: Date,
  
  // Geofence violations
  geofenceAlerts: [{
    geofenceId: mongoose.Schema.Types.ObjectId,
    type: { type: String, enum: ['enter', 'exit', 'off_route'] },
    timestamp: Date,
    location: [Number]
  }],
  activeGeofences: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Geofence' }]
}, {
  timestamps: true
});

// 2dsphere index on currentLocation for $geoWithin queries
vehicleSchema.index({ currentLocation: '2dsphere' });
vehicleSchema.index({ driver: 1 });
vehicleSchema.index({ status: 1 });

// Keep a compact live trail and a bounded history for playback.
vehicleSchema.methods.addTrailPoint = function(coords, speed, heading) {
  const MAX_TRAIL = 100;
  const MAX_HISTORY = 10000;
  const point = { coordinates: coords, timestamp: new Date(), speed, heading };
  this.trail.push(point);
  this.positionHistory.push(point);
  if (this.trail.length > MAX_TRAIL) {
    this.trail = this.trail.slice(-MAX_TRAIL);
  }
  if (this.positionHistory.length > MAX_HISTORY) {
    this.positionHistory = this.positionHistory.slice(-MAX_HISTORY);
  }
};

module.exports = mongoose.model('Vehicle', vehicleSchema);
