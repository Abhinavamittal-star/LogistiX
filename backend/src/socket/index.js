const { Server } = require('socket.io');
const { verifyToken, isDemoIdentity } = require('../utils/jwt');
const { isDemoMode } = require('../config/db');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.use((socket, next) => {
    try {
      const { token } = socket.handshake.auth || {};
      if (token) {
        socket.data.user = verifyToken(token);
        socket.data.user.demoMode = isDemoIdentity(socket.data.user);
      }
      socket.data.demoMode = socket.data.user?.demoMode === true || socket.handshake.auth?.demoMode === true;
      next();
    } catch (error) {
      next(new Error('Invalid access token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join rooms based on role
    socket.on('join:dispatcher', async () => {
      if (socket.data.user?.role !== 'dispatcher') return;
      const demoMode = isDemoMode(socket.data);
      const dispatcherRoom = demoMode ? 'dispatcher:demo' : 'dispatcher';
      socket.join(dispatcherRoom);
      console.log(`👮 Dispatcher joined: ${socket.id}`);
      try {
        if (!demoMode) {
          const [vehicles, alerts] = await Promise.all([
            require('../models/Vehicle').find({}).populate('driver', 'name').select('-positionHistory'),
            require('../models/Alert').find({}).sort({ timestamp: -1 }).limit(20)
          ]);
          socket.emit('vehicles:init', vehicles);
          socket.emit('alerts:init', alerts);
        } else {
          const { store } = require('../data/demoStore');
          socket.emit('vehicles:init', store.getVehicles());
          socket.emit('alerts:init', store.getAlerts(20));
        }
      } catch (error) {
        console.error('Could not initialize dispatcher socket:', error.message);
      }
    });

    if (socket.data.user?.role === 'customer') {
      const demoMode = isDemoMode(socket.data);
      socket.join(`customer:${demoMode ? 'demo:' : ''}${socket.data.user.id}`);
    }

    socket.on('join:driver', ({ driverId }) => {
      if (socket.data.user?.role !== 'driver' || String(socket.data.user.id) !== String(driverId)) return;
      socket.join(`driver:${driverId}`);
      socket.driverId = driverId;
      console.log(`🚗 Driver joined: ${driverId}`);
    });

    socket.on('join:shipment', async ({ trackingCode }) => {
      if (!trackingCode || typeof trackingCode !== 'string') return;
      let demoMode = isDemoMode(socket.data);
      let order = demoMode ? require('../data/demoStore').store.getOrder(trackingCode) : null;
      if (!demoMode) {
        order = await require('../models/Order').findOne({ trackingCode }).select('_id trackingCode');
        if (!order) {
          order = require('../data/demoStore').store.getOrder(trackingCode);
          demoMode = Boolean(order);
        }
      }
      if (!order) return;
      socket.join(`shipment:${demoMode ? 'demo:' : ''}${trackingCode}`);
      console.log(`📦 Customer tracking shipment`);
    });

    // Driver sends location update
    socket.on('driver:location', async (data) => {
      if (socket.data.user?.role !== 'driver') return;
      const { vehicleId, coordinates, speed, heading } = data || {};
      if (!Array.isArray(coordinates) || coordinates.length !== 2 ||
        coordinates.some(value => !Number.isFinite(Number(value))) ||
        Math.abs(Number(coordinates[0])) > 180 || Math.abs(Number(coordinates[1])) > 90) return;
      try {
        const { updateVehicleLocation, broadcastVehicleLocation } = require('../services/vehicleTracking');
        const driverId = String(socket.data.user.id);
        const demoMode = isDemoMode(socket.data);
        const vehicle = await updateVehicleLocation({
          vehicleId,
          driverId,
          coordinates: coordinates.map(Number),
          speed: Number(speed) || 0,
          heading: Number(heading) || 0,
          demoMode
        });
        if (vehicle) {
          await broadcastVehicleLocation(vehicle, { vehicleId, driverId, coordinates, speed, heading, demoMode });
        }
      } catch (error) {
        console.error('Driver location update failed:', error.message);
      }
    });

    // Simulator feeds vehicle movements
    socket.on('simulator:vehicle:move', async (data) => {
      const expectedToken = process.env.SIMULATOR_TOKEN;
      if (expectedToken ? socket.handshake.auth?.simulatorToken !== expectedToken : process.env.NODE_ENV === 'production') return;
      const { vehicleId, driverId, coordinates, speed, heading, trail } = data || {};
      if (!Array.isArray(coordinates) || coordinates.length !== 2 || coordinates.some(value => !Number.isFinite(Number(value)))) return;
      try {
        const { updateVehicleLocation, broadcastVehicleLocation } = require('../services/vehicleTracking');
        const demoMode = isDemoMode(socket.data);
        const vehicle = await updateVehicleLocation({ vehicleId, driverId, coordinates, speed, heading, demoMode });
        await broadcastVehicleLocation(vehicle, { vehicleId, driverId, coordinates, speed, heading, trail, demoMode });
      } catch (error) {
        console.error('Simulator location update failed:', error.message);
      }
    });

    // Order status update from driver
    socket.on('order:status', async (data) => {
      if (socket.data.user?.role !== 'driver' || String(socket.data.user.id) !== String(data?.driverId)) return;
      const allowedStatuses = {
        picked_up: ['assigned'],
        in_transit: ['picked_up', 'in_transit'],
        failed: ['assigned', 'picked_up', 'in_transit']
      };
      if (!allowedStatuses[data?.status]) return;
      try {
        const demoMode = isDemoMode(socket.data);
        const order = !demoMode
          ? await require('../models/Order').findOneAndUpdate(
            { _id: data.orderId, assignedDriver: socket.data.user.id, status: { $in: allowedStatuses[data.status] } },
            { status: data.status, $push: { statusHistory: { status: data.status, timestamp: new Date() } } },
            { new: true }
          )
          : (() => {
            const current = require('../data/demoStore').store.getOrder(data.orderId);
            return current && allowedStatuses[data.status].includes(current.status) &&
              String(current.assignedDriver?._id || current.assignedDriver) === String(data.driverId)
              ? require('../data/demoStore').store.updateOrder(data.orderId, { status: data.status })
              : null;
          })();
        if (!order) return;
        const publicUpdate = { orderId: order.orderId, trackingCode: order.trackingCode, status: order.status };
        io.to(demoMode ? 'dispatcher:demo' : 'dispatcher').emit('order:updated', order);
        if (order.trackingCode) io.to(`shipment:${demoMode ? 'demo:' : ''}${order.trackingCode}`).emit('order:updated', publicUpdate);
        if (order.customerId) {
          io.to(`customer:${demoMode ? 'demo:' : ''}${String(order.customerId._id || order.customerId)}`).emit('order:updated', order);
        }
      } catch (error) {
        console.error('Driver order status update failed:', error.message);
      }
    });

    // Alert broadcast (from geofence checks or ETA delay detection)
    socket.on('send:alert', async (alert) => {
      const expectedToken = process.env.SIMULATOR_TOKEN;
      if (expectedToken ? socket.handshake.auth?.simulatorToken !== expectedToken : process.env.NODE_ENV === 'production') return;
      const demoMode = isDemoMode(socket.data);
      const savedAlert = { ...alert, timestamp: new Date().toISOString() };
      try {
        if (demoMode) require('../data/demoStore').store.addAlert(savedAlert);
        else await require('../models/Alert').create(savedAlert);
        io.to(demoMode ? 'dispatcher:demo' : 'dispatcher').emit('alert:new', savedAlert);
      } catch (error) {
        console.error('Alert broadcast failed:', error.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
