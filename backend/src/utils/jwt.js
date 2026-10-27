const jwt = require('jsonwebtoken');

const isDemoIdentity = claims =>
  claims?.demoMode === true || String(claims?.id || '').startsWith('demo_');

const generateTokens = (userId, role, claims = {}) => {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be configured in production');
  }
  const payload = {
    id: String(userId),
    role,
    name: claims.name,
    email: claims.email,
    demoMode: isDemoIdentity({ ...claims, id: userId })
  };
  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
  
  const refreshToken = jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
  
  return { accessToken, refreshToken };
};

const verifyToken = (token, isRefresh = false) => {
  const secret = isRefresh
    ? (process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret')
    : (process.env.JWT_SECRET || 'fallback_secret');
  return jwt.verify(token, secret);
};

module.exports = { generateTokens, verifyToken, isDemoIdentity };
