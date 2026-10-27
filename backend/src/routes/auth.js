const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { generateTokens, verifyToken } = require('../utils/jwt');
const { protect, authorize } = require('../middleware/auth');
const { isDemoMode } = require('../config/db');
const { getIO } = require('../socket');
const rateLimit = require('express-rate-limit');
const { isValidDispatcherRegistrationCode } = require('../utils/dispatcherRegistration');

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' }
});

// Demo identities use the isolated in-memory workspace, even when MongoDB is active.
const DEMO_USERS = [
  { _id: 'demo_dispatcher_1', name: 'Alex Dispatcher', email: 'dispatcher@demo.com', role: 'dispatcher', passwordHash: null },
  { _id: 'demo_driver_1', name: 'Sam Driver', email: 'driver@demo.com', role: 'driver', passwordHash: null },
  { _id: 'demo_customer_1', name: 'Jane Customer', email: 'customer@demo.com', role: 'customer', passwordHash: null },
  { _id: 'demo_driver_2', name: 'Mike Driver', email: 'driver2@demo.com', role: 'driver', passwordHash: null },
  { _id: 'demo_driver_3', name: 'Lisa Driver', email: 'driver3@demo.com', role: 'driver', passwordHash: null },
  { _id: 'demo_driver_4', name: 'Tom Driver', email: 'driver4@demo.com', role: 'driver', passwordHash: null },
];

// Initialize demo password hashes
const demoPasswordHash = bcrypt.hashSync('demo123', 10);
DEMO_USERS.forEach(user => { user.passwordHash = demoPasswordHash; });

const findDemoUser = (email) => DEMO_USERS.find(u => u.email === email);
const dispatcherRegistrationEnabled = () =>
  Boolean(process.env.DISPATCHER_REGISTRATION_CODE) && !isDemoMode();
router.get('/registration-options', (req, res) => {
  res.json({ dispatcherRegistrationEnabled: dispatcherRegistrationEnabled() });
});

// POST /api/auth/register
router.post('/register', registrationLimiter, async (req, res) => {
  try {
    const { name, password, dispatcherRegistrationCode } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = req.body.role || 'customer';
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!['customer', 'driver', 'dispatcher'].includes(role)) return res.status(400).json({ error: 'Select a valid account role' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (role === 'dispatcher') {
      if (!dispatcherRegistrationEnabled()) {
        return res.status(403).json({ error: 'Dispatcher registration is not enabled. Ask an administrator to configure it.' });
      }
      if (!isValidDispatcherRegistrationCode(dispatcherRegistrationCode)) {
        return res.status(403).json({ error: 'Invalid dispatcher registration code' });
      }
      if (password.length < 12) return res.status(400).json({ error: 'Dispatcher passwords must be at least 12 characters' });
    }

    if (!isDemoMode()) {
      const User = require('../models/User');
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      
      const user = await User.create({ name, email, password, role });
      const { accessToken, refreshToken } = generateTokens(user._id, user.role, user);
      getIO()?.to('dispatcher').emit('account:created', {
        _id: String(user._id), name: user.name, email: user.email, role: user.role,
        phone: user.phone, createdAt: user.createdAt
      });
      
      return res.status(201).json({ user, accessToken, refreshToken });
    }

    if (role === 'dispatcher') {
      return res.status(503).json({ error: 'Dispatcher registration requires MongoDB storage' });
    }

    const existing = findDemoUser(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const newUser = {
      _id: `demo_${Date.now()}`,
      name,
      email: email.toLowerCase(),
      role,
      passwordHash: await bcrypt.hash(password, 10)
    };
    DEMO_USERS.push(newUser);
    getIO()?.to('dispatcher:demo').emit('account:created', {
      _id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role
    });
    const { accessToken, refreshToken } = generateTokens(newUser._id, newUser.role, newUser);
    const { passwordHash, ...userSafe } = newUser;
    return res.status(201).json({ user: userSafe, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const demoUser = findDemoUser(email);
    if (demoUser) {
      const match = await bcrypt.compare(password, demoUser.passwordHash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      const demoProfile = { ...demoUser, demoMode: true };
      const { accessToken, refreshToken } = generateTokens(demoUser._id, demoUser.role, demoProfile);
      const { passwordHash, ...userSafe } = demoProfile;
      return res.json({ user: userSafe, accessToken, refreshToken });
    }

    if (!isDemoMode()) {
      const User = require('../models/User');
      const user = await User.findOne({ email }).select('+password');
      
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const { accessToken, refreshToken } = generateTokens(user._id, user.role, user);
      user.password = undefined;
      return res.json({ user, accessToken, refreshToken });
    }

    const user = findDemoUser(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const { accessToken, refreshToken } = generateTokens(user._id, user.role, user);
    const { passwordHash, ...userSafe } = user;
    return res.json({ user: userSafe, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const decoded = verifyToken(req.body?.refreshToken, true);
    const { accessToken, refreshToken } = generateTokens(decoded.id, decoded.role, decoded);
    return res.json({ accessToken, refreshToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// GET /api/auth/demo-credentials
router.get('/demo-credentials', (req, res) => {
  res.json({
    credentials: [
      { role: 'dispatcher', email: 'dispatcher@demo.com', password: 'demo123' },
      { role: 'driver', email: 'driver@demo.com', password: 'demo123' },
      { role: 'customer', email: 'customer@demo.com', password: 'demo123' }
    ]
  });
});

// GET /api/auth/drivers — list all drivers (for dispatcher)
router.get('/drivers', protect, authorize('dispatcher'), async (req, res) => {
  try {
    if (!isDemoMode(req)) {
      const User = require('../models/User');
      const drivers = await User.find({ role: 'driver' }).select('-password');
      return res.json(drivers);
    }
    const drivers = DEMO_USERS.filter(u => u.role === 'driver').map(({ passwordHash, ...u }) => u);
    return res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/customers', protect, authorize('dispatcher'), async (req, res) => {
  try {
    if (!isDemoMode(req)) {
      const User = require('../models/User');
      const customers = await User.find({ role: 'customer' }).select('name email phone isActive createdAt').sort({ createdAt: -1 });
      return res.json(customers);
    }
    return res.json(DEMO_USERS.filter(user => user.role === 'customer').map(({ passwordHash, ...user }) => user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
