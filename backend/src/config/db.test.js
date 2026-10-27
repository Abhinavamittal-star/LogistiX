const test = require('node:test');
const assert = require('node:assert/strict');
const { isDemoMode } = require('./db');

test('demo mode is scoped to the signed-in demo user', () => {
  assert.equal(isDemoMode({ user: { demoMode: true } }), true);
  assert.equal(isDemoMode({ demoMode: true }), true);
  assert.equal(isDemoMode({ user: { demoMode: false } }), false);
  assert.equal(isDemoMode({}), false);
});
