const mongoose = require('mongoose');
const dns = require('dns');

const dnsServers = process.env.MONGO_DNS_SERVERS?.split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers?.length) dns.setServers(dnsServers);

let isConnected = false;
let demoMode = false;

const connectDB = async () => {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  
  if (process.env.DEMO_MODE === 'true' || !uri || /<username>|<password>|cluster0\.example\.mongodb\.net|cluster0\.xxxxx\.mongodb\.net/i.test(uri)) {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
      throw new Error('MONGO_URI must be configured for production. Use DEMO_MODE=true only for an intentional demo deployment.');
    }
    demoMode = true;
    isConnected = true;
    console.warn('Running in explicit in-memory demo mode. Data resets when the server restarts.');
    return;
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = true;
    demoMode = false;
    console.log('✅ MongoDB connected');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      isConnected = false;
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

const getIsConnected = () => isConnected;
const isDemoMode = context => demoMode ||
  context?.demoMode === true ||
  context?.user?.demoMode === true;
const getStorageMode = () => demoMode ? 'memory' : 'mongodb';

module.exports = { connectDB, getIsConnected, isDemoMode, getStorageMode };
