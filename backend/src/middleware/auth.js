const { verifyToken, isDemoIdentity } = require('../utils/jwt');
const { isDemoMode } = require('../config/db');

// In-memory user store for demo mode (when MongoDB not configured)
const demoUsers = new Map([
  ['dispatcher@demo.com', {
    _id: 'demo_dispatcher_1',
    name: 'Alex Dispatcher',
    email: 'dispatcher@demo.com',
    role: 'dispatcher',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8KRk7oC' // demo123
  }],
  ['driver@demo.com', {
    _id: 'demo_driver_1',
    name: 'Sam Driver',
    email: 'driver@demo.com',
    role: 'driver',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8KRk7oC' // demo123
  }],
  ['customer@demo.com', {
    _id: 'demo_customer_1',
    name: 'Jane Customer',
    email: 'customer@demo.com',
    role: 'customer',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8KRk7oC' // demo123
  }]
]);

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    req.user = { ...decoded, demoMode: isDemoIdentity(decoded) };
    if (!isDemoMode(req)) {
      const User = require('../models/User');
      const user = await User.findById(decoded.id).select('-password');
      if (!user || !user.isActive) return res.status(401).json({ error: 'Account is unavailable' });
      req.user = user;
    }
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return next(err);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied: insufficient permissions' });
  }
  next();
};

module.exports = { protect, authorize };
