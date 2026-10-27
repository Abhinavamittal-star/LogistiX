const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTokens, verifyToken, isDemoIdentity } = require('./jwt');

test('legacy demo identities retain demo isolation when tokens are refreshed', () => {
  const tokens = generateTokens('demo_dispatcher_1', 'dispatcher');
  assert.equal(verifyToken(tokens.accessToken).demoMode, true);
  assert.equal(isDemoIdentity({ id: 'demo_driver_1' }), true);
  assert.equal(isDemoIdentity({ id: '507f1f77bcf86cd799439011' }), false);
});
