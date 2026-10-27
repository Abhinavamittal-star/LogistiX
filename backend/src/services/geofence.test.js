const test = require('node:test');
const assert = require('node:assert/strict');
const { pointInPolygon } = require('./geofence');

const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

test('point-in-polygon distinguishes interior and exterior points', () => {
  assert.equal(pointInPolygon([0.5, 0.5], ring), true);
  assert.equal(pointInPolygon([1.5, 0.5], ring), false);
});
