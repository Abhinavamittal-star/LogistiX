const test = require('node:test');
const assert = require('node:assert/strict');
const { optimizeAssignments, routeDistance, twoOpt } = require('./routeOptimizer');

const start = [77.5946, 12.9716];
const order = (id, coordinates) => ({
  _id: id,
  orderId: id,
  delivery: { location: { coordinates } }
});

test('2-opt never returns a longer route than its input', () => {
  const route = [order('east', [77.7, 12.98]), order('west', [77.4, 12.98]), order('near', [77.59, 12.97])];
  const optimized = twoOpt(start, route);
  assert.ok(optimized.distance <= routeDistance(start, route));
  assert.equal(optimized.route.length, route.length);
});

test('optimizer assigns every order once and provides route sequence values', () => {
  const orders = [
    order('a', [77.6, 12.98]),
    order('b', [77.45, 12.95]),
    order('c', [77.55, 13.03]),
    order('d', [77.3, 12.96])
  ];
  const result = optimizeAssignments(orders, [
    { driverId: 'driver-a', startCoord: start },
    { driverId: 'driver-b', startCoord: [77.3, 12.96] }
  ]);
  const routes = result.assignments.flatMap(assignment => assignment.orders);
  assert.deepEqual(routes.map(item => item._id).sort(), ['a', 'b', 'c', 'd']);
  assert.ok(result.assignments.every(assignment => assignment.orders.every((item, index) => item.routeSequence === index + 1)));
  assert.equal(result.stats.totalOrders, 4);
});

test('optimizer handles an empty driver route', () => {
  const result = optimizeAssignments([], [{ driverId: 'driver-a', startCoord: start }]);
  assert.equal(result.stats.afterDistance, 0);
  assert.deepEqual(result.assignments[0].orders, []);
});
