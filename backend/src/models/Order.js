const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  
  // Pickup location
  pickup: {
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    },
    contactName: String,
    contactPhone: String,
    notes: String,
    scheduledAt: Date
  },
  
  // Delivery location
  delivery: {
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    },
    contactName: String,
    contactPhone: String,
    notes: String,
    scheduledAt: Date
  },

  // Assignment
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Timing
  estimatedDistance: Number, // km
  estimatedDuration: Number, // minutes
  eta: Date,
  pickedUpAt: Date,
  deliveredAt: Date,
  
  // Proof of delivery
  proofOfDelivery: {
    signature: String, // base64
    photo: String, // base64 or URL
    notes: String,
    capturedAt: Date
  },
  
  // Priority and metadata
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  weight: Number, // kg
  dimensions: String,
  value: Number, // monetary value
  
  // Route optimization
  routeSequence: Number, // position in optimized route
  optimizedRoute: {
    coordinates: [[Number]], // array of [lng, lat] waypoints
    distance: Number,
    duration: Number
  },
  
  isDelayed: { type: Boolean, default: false },
  delayMinutes: { type: Number, default: 0 },
  
  statusHistory: [{
    status: String,
    timestamp: Date,
    note: String,
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number]
    }
  }],
  
  trackingCode: { type: String, unique: true }
}, {
  timestamps: true
});

// 2dsphere indexes for geospatial queries
orderSchema.index({ 'pickup.location': '2dsphere' });
orderSchema.index({ 'delivery.location': '2dsphere' });
orderSchema.index({ status: 1 });
orderSchema.index({ assignedDriver: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
