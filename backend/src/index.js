require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { connectDB, getStorageMode, isDemoMode } = require('./config/db');
const { initSocket } = require('./socket');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const vehicleRoutes = require('./routes/vehicles');
const geofenceRoutes = require('./routes/geofences');
const routeOptimizeRoutes = require('./routes/optimize');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/optimize', routeOptimizeRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const ready = isDemoMode() || mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    connected: ready,
    storageMode: getStorageMode(),
    demoAvailable: true,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Init Socket.io
initSocket(server);

// Start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Logistics Control Tower backend running on port ${PORT}`);
    console.log(`📡 Socket.io enabled`);
    console.log(`🗺️  Environment: ${process.env.NODE_ENV}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

module.exports = { app, server };
