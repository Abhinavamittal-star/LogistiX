/**
 * In-memory data store for demo mode (when MongoDB is not configured).
 * All data is seeded with realistic demo data for Bengaluru, India.
 */

const { v4: uuidv4 } = require('uuid');

const BENGALURU_LOCATIONS = [
  { address: 'MG Road, Bengaluru', coordinates: [77.6067, 12.9755] },
  { address: 'Indiranagar, Bengaluru', coordinates: [77.6408, 12.9784] },
  { address: 'Koramangala, Bengaluru', coordinates: [77.6245, 12.9352] },
  { address: 'Jayanagar, Bengaluru', coordinates: [77.5830, 12.9250] },
  { address: 'Malleshwaram, Bengaluru', coordinates: [77.5681, 13.0031] },
  { address: 'Hebbal, Bengaluru', coordinates: [77.5913, 13.0358] },
  { address: 'Yeshwanthpur, Bengaluru', coordinates: [77.5400, 13.0285] },
  { address: 'Rajajinagar, Bengaluru', coordinates: [77.5549, 12.9911] },
  { address: 'Basavanagudi, Bengaluru', coordinates: [77.5688, 12.9435] },
  { address: 'HSR Layout, Bengaluru', coordinates: [77.6387, 12.9116] },
  { address: 'BTM Layout, Bengaluru', coordinates: [77.6101, 12.9166] },
  { address: 'Whitefield, Bengaluru', coordinates: [77.7499, 12.9698] },
  { address: 'Marathahalli, Bengaluru', coordinates: [77.6974, 12.9591] },
  { address: 'Bellandur, Bengaluru', coordinates: [77.6762, 12.9250] },
  { address: 'Electronic City, Bengaluru', coordinates: [77.6602, 12.8399] },
  { address: 'Banashankari, Bengaluru', coordinates: [77.5671, 12.9255] },
  { address: 'Vijayanagar, Bengaluru', coordinates: [77.5350, 12.9700] },
  { address: 'Ulsoor, Bengaluru', coordinates: [77.6200, 12.9817] },
  { address: 'RT Nagar, Bengaluru', coordinates: [77.5946, 13.0197] },
  { address: 'Kengeri, Bengaluru', coordinates: [77.4830, 12.9177] },
];

const VEHICLE_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];
const CUSTOMER_NAMES = ['Emma Wilson', 'Liam Brown', 'Olivia Jones', 'Noah Davis', 'Ava Miller', 'William Taylor', 'Sophia Anderson', 'James Thomas', 'Charlotte Jackson', 'Benjamin Harris'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randItem = (arr) => arr[randInt(0, arr.length - 1)];
const randCoord = (base, range = 0.01) => base + (Math.random() - 0.5) * range * 2;

// Generate seed orders
const generateOrders = (count = 25) => {
  const statuses = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];
  const priorities = ['low', 'normal', 'normal', 'high', 'urgent'];
  const orders = [];
  
  for (let i = 0; i < count; i++) {
    const pickup = randItem(BENGALURU_LOCATIONS);
    let delivery = randItem(BENGALURU_LOCATIONS);
    while (delivery.address === pickup.address) delivery = randItem(BENGALURU_LOCATIONS);
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const driverIds = ['demo_driver_1', 'demo_driver_2', 'demo_driver_3', 'demo_driver_4'];
    const assignedDriver = status !== 'pending' ? randItem(driverIds) : null;
    
    const now = new Date();
    const eta = new Date(now.getTime() + randInt(15, 120) * 60000);
    
    orders.push({
      _id: `order_${i + 1}`,
      orderId: `ORD-${String(i + 1001).padStart(4, '0')}`,
      trackingCode: `TRK${uuidv4().replace(/-/g, '').toUpperCase()}`,
      customerName: randItem(CUSTOMER_NAMES),
      customerEmail: `customer${i}@demo.com`,
      customerPhone: `+91 80 ${randInt(1000, 9999)} ${randInt(1000, 9999)}`,
      pickup: {
        address: pickup.address,
        location: { type: 'Point', coordinates: [randCoord(pickup.coordinates[0], 0.005), randCoord(pickup.coordinates[1], 0.005)] },
        contactName: randItem(CUSTOMER_NAMES),
        contactPhone: `+91 80 ${randInt(1000, 9999)} ${randInt(1000, 9999)}`,
        scheduledAt: new Date(now.getTime() - randInt(10, 60) * 60000)
      },
      delivery: {
        address: delivery.address,
        location: { type: 'Point', coordinates: [randCoord(delivery.coordinates[0], 0.005), randCoord(delivery.coordinates[1], 0.005)] },
        contactName: randItem(CUSTOMER_NAMES),
        contactPhone: `+91 80 ${randInt(1000, 9999)} ${randInt(1000, 9999)}`,
        scheduledAt: eta
      },
      status,
      assignedDriver,
      priority: randItem(priorities),
      weight: randInt(1, 50),
      estimatedDistance: randInt(2, 20),
      estimatedDuration: randInt(15, 90),
      eta,
      isDelayed: Math.random() > 0.8,
      delayMinutes: Math.random() > 0.8 ? randInt(5, 45) : 0,
      createdAt: new Date(now.getTime() - randInt(30, 300) * 60000),
      updatedAt: new Date(),
      statusHistory: [{ status: 'pending', timestamp: new Date(now.getTime() - randInt(30, 300) * 60000) }]
    });
  }
  
  return orders;
};

// Generate seed vehicles
const generateVehicles = () => {
  const drivers = [
    { id: 'demo_driver_1', name: 'Sam Driver', center: [77.6067, 12.9755] },
    { id: 'demo_driver_2', name: 'Mike Driver', center: [77.6408, 12.9784] },
    { id: 'demo_driver_3', name: 'Lisa Driver', center: [77.5830, 12.9250] },
    { id: 'demo_driver_4', name: 'Tom Driver', center: [77.5913, 13.0358] },
  ];
  
  return drivers.map((d, i) => ({
    _id: `vehicle_${i + 1}`,
    vehicleId: `VEH-${String(i + 1).padStart(3, '0')}`,
    driver: { _id: d.id, name: d.name, email: `driver${i > 0 ? i + 1 : ''}@demo.com` },
    driverId: d.id,
    currentLocation: {
      type: 'Point',
      coordinates: [...d.center],
      heading: randInt(0, 359),
      speed: randInt(20, 60)
    },
    trail: [],
    activeGeofences: [],
    status: ['en_route', 'idle', 'en_route', 'at_pickup'][i],
    plateNumber: `KA${randInt(10, 99)} ${String.fromCharCode(65 + i)}${randInt(1000, 9999)}`,
    type: ['van', 'truck', 'van', 'motorcycle'][i],
    capacity: [500, 2000, 500, 50][i],
    color: VEHICLE_COLORS[i],
    activeOrders: [],
    totalDistance: randInt(20, 150),
    deliveriesCompleted: randInt(3, 15),
    lastHeartbeat: new Date(),
    isSimulated: false
  }));
};

// Generate seed geofences
const generateGeofences = () => [
  {
    _id: 'geofence_1',
    name: 'Central Bengaluru Zone',
    description: 'Central business district monitoring',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [77.580, 12.955], [77.625, 12.955],
        [77.625, 12.990], [77.580, 12.990],
        [77.580, 12.955]
      ]]
    },
    color: '#f97316',
    opacity: 0.15,
    alertOnEnter: true,
    alertOnExit: true,
    isActive: true,
    breachCount: 3
  },
  {
    _id: 'geofence_2',
    name: 'Whitefield Restricted',
    description: 'Restricted delivery zone - scheduled access only',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [77.730, 12.950], [77.770, 12.950],
        [77.770, 12.990], [77.730, 12.990],
        [77.730, 12.950]
      ]]
    },
    color: '#ef4444',
    opacity: 0.2,
    alertOnEnter: true,
    alertOnExit: false,
    isActive: true,
    breachCount: 1
  }
];

class DemoStore {
  constructor() {
    this.orders = generateOrders(25);
    this.vehicles = generateVehicles();
    this.geofences = generateGeofences();
    this.alerts = [];
  }
  
  // Orders
  getOrders(filter = {}) {
    let result = [...this.orders];
    if (filter.status) result = result.filter(o => o.status === filter.status);
    if (filter.assignedDriver) result = result.filter(o => String(o.assignedDriver?._id || o.assignedDriver) === String(filter.assignedDriver));
    if (filter.customerId) result = result.filter(o => String(o.customerId) === String(filter.customerId));
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  getOrder(id) {
    return this.orders.find(o => o._id === id || o.orderId === id || o.trackingCode === id);
  }
  
  createOrder(data) {
    const idx = this.orders.length + 1;
    const order = {
      _id: `order_${Date.now()}`,
      orderId: `ORD-${String(1000 + idx).padStart(4, '0')}`,
      trackingCode: `TRK${uuidv4().slice(0, 8).toUpperCase()}`,
      status: 'pending',
      isDelayed: false,
      delayMinutes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      statusHistory: [{ status: 'pending', timestamp: new Date() }],
      ...data
    };
    this.orders.unshift(order);
    return order;
  }
  
  updateOrder(id, updates) {
    const idx = this.orders.findIndex(o => o._id === id || o.orderId === id);
    if (idx === -1) return null;
    this.orders[idx] = { ...this.orders[idx], ...updates, updatedAt: new Date() };
    return this.orders[idx];
  }

  deleteOrder(id) {
    const idx = this.orders.findIndex(order => order._id === id || order.orderId === id);
    if (idx === -1) return null;
    return this.orders.splice(idx, 1)[0];
  }
  
  // Vehicles
  getVehicles() { return [...this.vehicles]; }
  
  getVehicle(id) {
    return this.vehicles.find(v => v._id === id || v.vehicleId === id || v.driverId === id);
  }
  
  updateVehicleLocation(vehicleId, coords, speed, heading) {
    const v = this.vehicles.find(v => v._id === vehicleId || v.vehicleId === vehicleId || v.driverId === vehicleId);
    if (!v) return null;
    
    // Add to trail
    const point = { coordinates: coords, timestamp: new Date(), speed, heading };
    if (!v.trail) v.trail = [];
    v.trail.push(point);
    if (v.trail.length > 150) v.trail = v.trail.slice(-150);
    
    v.currentLocation = { type: 'Point', coordinates: coords, heading, speed };
    v.lastHeartbeat = new Date();
    return v;
  }
  
  // Geofences
  getGeofences() { return [...this.geofences]; }
  
  createGeofence(data) {
    const gf = { _id: `geofence_${Date.now()}`, ...data, breachCount: 0, createdAt: new Date() };
    this.geofences.push(gf);
    return gf;
  }
  
  deleteGeofence(id) {
    const idx = this.geofences.findIndex(g => g._id === id);
    if (idx === -1) return false;
    this.geofences.splice(idx, 1);
    return true;
  }
  
  // Alerts
  addAlert(alert) {
    this.alerts.unshift({ _id: `alert_${Date.now()}`, timestamp: new Date(), ...alert });
    if (this.alerts.length > 100) this.alerts = this.alerts.slice(0, 100);
  }
  
  getAlerts(limit = 20) { return this.alerts.slice(0, limit); }
}

// Singleton store
const store = new DemoStore();
module.exports = { store };
