require('dotenv').config();
const { io } = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const VEHICLE_COUNT = Math.min(Math.max(parseInt(process.env.VEHICLE_COUNT || '4', 10) || 4, 1), 50);
const SPEED_KMH = parseFloat(process.env.SPEED_KMH || '45');
const UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS || '1500');
const ROUTING_BASE_URL = process.env.ROUTING_BASE_URL || 'https://router.project-osrm.org/route/v1/driving';

// Connect to backend socket
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnectionDelay: 2000,
  auth: { simulatorToken: process.env.SIMULATOR_TOKEN || '', demoMode: true }
});

let simulationTimer = null;
let starting = false;

socket.on('connect', () => {
  console.log(`🔌 Simulator connected to backend: ${socket.id}`);
  if (!starting) startSimulation();
});

socket.on('connect_error', (err) => {
  console.error('❌ Cannot connect to backend:', err.message);
  console.log('Retrying in 3s...');
});

// ---- Simulation State ----
const VEHICLE_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7'];
const VEHICLE_IDS = Array.from({ length: VEHICLE_COUNT }, (_, index) => `VEH-${String(index + 1).padStart(3, '0')}`);
const DRIVER_IDS = Array.from({ length: VEHICLE_COUNT }, (_, index) => `demo_driver_${index + 1}`);
const VEHICLE_TYPES = ['van', 'truck', 'van', 'motorcycle'];
const ROUTE_BY_VEHICLE = [0, 0, 1, 2];

// Bengaluru road-like waypoints, used when OSRM is unavailable.
const BENGALURU_ROUTES = [
  // Route 1: Central and east Bengaluru
  [
    [77.5946, 12.9716], [77.6067, 12.9755], [77.6200, 12.9817],
    [77.6408, 12.9784], [77.6570, 12.9780], [77.6762, 12.9690],
    [77.6974, 12.9591], [77.6762, 12.9250], [77.6550, 12.9300],
    [77.6387, 12.9116], [77.6245, 12.9352], [77.6101, 12.9166],
    [77.6010, 12.9480], [77.5946, 12.9716]
  ],
  // Route 2: South Bengaluru loop
  [
    [77.5830, 12.9250], [77.5671, 12.9255], [77.5688, 12.9435],
    [77.5549, 12.9580], [77.5350, 12.9700], [77.5549, 12.9911],
    [77.5681, 13.0031], [77.5946, 13.0197], [77.5913, 13.0358],
    [77.5681, 13.0031], [77.5830, 12.9910], [77.5946, 12.9716],
    [77.6010, 12.9480], [77.5830, 12.9250]
  ],
  // Route 3: North Bengaluru loop
  [
    [77.5913, 13.0358], [77.5800, 13.0450], [77.5580, 13.0520],
    [77.5400, 13.0285], [77.5350, 12.9980], [77.5549, 12.9911],
    [77.5681, 13.0031], [77.5946, 13.0197], [77.6200, 13.0120],
    [77.6408, 12.9980], [77.6408, 12.9784], [77.6200, 12.9817],
    [77.5946, 12.9716], [77.5913, 13.0358]
  ],
  // Route 4: Outer Bengaluru loop
  [
    [77.4830, 12.9177], [77.5100, 12.9420], [77.5350, 12.9700],
    [77.5549, 12.9911], [77.5681, 13.0031], [77.5913, 13.0358],
    [77.6408, 13.0100], [77.6974, 12.9990], [77.7499, 12.9698],
    [77.6974, 12.9591], [77.6762, 12.9250], [77.6387, 12.9116],
    [77.6101, 12.9166], [77.4830, 12.9177]
  ]
];

function haversineDistanceMeters([lng1, lat1], [lng2, lat2]) {
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class VehicleSimulator {
  constructor(vehicleId, driverId, routePoints, color, type) {
    this.vehicleId = vehicleId;
    this.driverId = driverId;
    this.routePoints = routePoints;
    this.color = color;
    this.type = type;
    this.currentSegmentIdx = 0;
    this.progress = 0;
    this.trail = [];

    const startLocations = [
      [77.6067, 12.9755],
      [77.6408, 12.9784],
      [77.5830, 12.9250],
      [77.5913, 13.0358]
    ];
    const start = startLocations[parseInt(vehicleId.slice(-3), 10) - 1] || routePoints[0];
    let nearestDistance = Infinity;
    routePoints.slice(0, -1).forEach((point, index) => {
      const distance = haversineDistanceMeters(start, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        this.currentSegmentIdx = index;
      }
    });
  }
  
  // Calculate current position along current segment
  getPosition() {
    const from = this.routePoints[this.currentSegmentIdx];
    const to = this.routePoints[(this.currentSegmentIdx + 1) % this.routePoints.length];
    
    const lng = from[0] + (to[0] - from[0]) * this.progress;
    const lat = from[1] + (to[1] - from[1]) * this.progress;
    
    return [lng, lat];
  }
  
  // Calculate heading (bearing) in degrees
  getHeading() {
    const from = this.routePoints[this.currentSegmentIdx];
    const to = this.routePoints[(this.currentSegmentIdx + 1) % this.routePoints.length];
    const dLng = to[0] - from[0];
    const dLat = to[1] - from[1];
    let heading = Math.atan2(dLng, dLat) * (180 / Math.PI);
    if (heading < 0) heading += 360;
    return heading;
  }
  
  // Segment length in meters
  segmentLength() {
    const from = this.routePoints[this.currentSegmentIdx];
    const to = this.routePoints[(this.currentSegmentIdx + 1) % this.routePoints.length];
    const lat1 = from[1] * Math.PI / 180;
    const lat2 = to[1] * Math.PI / 180;
    const deltaLat = lat2 - lat1;
    const deltaLng = (to[0] - from[0]) * Math.PI / 180;
    const haversine = Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }
  
  advance(deltaMs) {
    let remainingMeters = (SPEED_KMH * Math.max(deltaMs, 0)) / 3600;
    let zeroLengthSegments = 0;
    const segmentCount = this.routePoints.length - 1;

    while (remainingMeters > 0 && segmentCount > 0) {
      const segmentMeters = this.segmentLength();
      if (segmentMeters < 0.1) {
        this.currentSegmentIdx = (this.currentSegmentIdx + 1) % segmentCount;
        this.progress = 0;
        zeroLengthSegments += 1;
        if (zeroLengthSegments >= segmentCount) break;
        continue;
      }

      zeroLengthSegments = 0;
      const metersToNextSegment = (1 - this.progress) * segmentMeters;
      if (remainingMeters >= metersToNextSegment) {
        remainingMeters -= metersToNextSegment;
        this.currentSegmentIdx = (this.currentSegmentIdx + 1) % segmentCount;
        this.progress = 0;
      } else {
        this.progress += remainingMeters / segmentMeters;
        remainingMeters = 0;
      }
    }
  }
  
  // Add small noise to simulate real GPS
  addNoise([lng, lat], noise = 0.000025) {
    return [
      lng + (Math.random() - 0.5) * noise,
      lat + (Math.random() - 0.5) * noise
    ];
  }
  
  step(deltaMs) {
    this.advance(deltaMs);
    const rawPos = this.getPosition();
    const pos = this.addNoise(rawPos);
    const heading = this.getHeading();
    
    // Add to trail
    this.trail.push({ coordinates: pos, timestamp: Date.now() });
    if (this.trail.length > 80) this.trail = this.trail.slice(-80);
    
    return {
      vehicleId: this.vehicleId,
      driverId: this.driverId,
      coordinates: pos,
      speed: SPEED_KMH + (Math.random() - 0.5) * 10,
      heading,
      color: this.color,
      type: this.type,
      trail: this.trail.slice(-40), // send last 40 points
      timestamp: new Date().toISOString()
    };
  }
}

// ---- Start Simulation ----
async function getRoadRoute(waypoints) {
  const coordinates = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  try {
    const response = await axios.get(`${ROUTING_BASE_URL}/${coordinates}`, {
      params: { overview: 'full', geometries: 'geojson', steps: false },
      timeout: 8000
    });
    const route = response.data?.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(route) && route.length >= 2) return route;
    throw new Error('Routing provider returned no route geometry');
  } catch (error) {
    console.warn(`Road routing unavailable; using built-in route: ${error.message}`);
    return waypoints;
  }
}

async function startSimulation() {
  if (starting) return;
  starting = true;
  if (simulationTimer) clearInterval(simulationTimer);
  const routes = await Promise.all(VEHICLE_IDS.map((_, index) =>
    getRoadRoute(BENGALURU_ROUTES[ROUTE_BY_VEHICLE[index] ?? index % BENGALURU_ROUTES.length])
  ));
  const simulators = VEHICLE_IDS.map((vId, i) => new VehicleSimulator(
    vId,
    DRIVER_IDS[i],
    routes[i],
    VEHICLE_COLORS[i % VEHICLE_COLORS.length],
    VEHICLE_TYPES[i % VEHICLE_TYPES.length]
  ));
  
  console.log(`🚗 Starting simulation with ${VEHICLE_COUNT} vehicles in Bengaluru`);
  console.log(`📡 Emitting to ${BACKEND_URL} every ${UPDATE_INTERVAL_MS}ms`);
  
  let lastTime = Date.now();
  
  simulationTimer = setInterval(() => {
    const now = Date.now();
    const delta = now - lastTime;
    lastTime = now;
    
    simulators.forEach(sim => {
      const update = sim.step(delta);
      socket.emit('simulator:vehicle:move', update);
    });
    
    // Occasionally generate a random alert
    if (Math.random() < 0.01) {
      const sim = simulators[Math.floor(Math.random() * simulators.length)];
      const pos = sim.getPosition();
      socket.emit('send:alert', {
        type: Math.random() > 0.5 ? 'geofence' : 'delay',
        vehicleId: sim.vehicleId,
        message: Math.random() > 0.5
          ? `Vehicle ${sim.vehicleId} entered restricted zone`
          : `Vehicle ${sim.vehicleId} is running 12 minutes behind schedule`,
        severity: Math.random() > 0.7 ? 'danger' : 'warning',
        location: pos
      });
    }
  }, UPDATE_INTERVAL_MS);
  starting = false;
}

console.log(`🚀 Logistics Simulator starting...`);
console.log(`Backend: ${BACKEND_URL}`);
