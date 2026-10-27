function haversineDistance(coord1, coord2) {
  const radiusKm = 6371;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function orderCoordinate(order) {
  return order.delivery?.location?.coordinates || order.delivery?.coordinates;
}

function nearestNeighborRoute(start, orders) {
  const remaining = [...orders];
  const route = [];
  let current = start;
  while (remaining.length) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    remaining.forEach((order, index) => {
      const distance = haversineDistance(current, orderCoordinate(order));
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
    });
    const [order] = remaining.splice(nearestIndex, 1);
    route.push(order);
    current = orderCoordinate(order);
  }
  return route;
}

function routeDistance(start, route) {
  let distance = 0;
  let previous = start;
  for (const order of route) {
    const coordinate = orderCoordinate(order);
    distance += haversineDistance(previous, coordinate);
    previous = coordinate;
  }
  return distance;
}

function twoOpt(start, route) {
  let best = [...route];
  let bestDistance = routeDistance(start, best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const distance = routeDistance(start, candidate);
        if (distance < bestDistance - 0.001) {
          best = candidate;
          bestDistance = distance;
          improved = true;
        }
      }
    }
  }
  return { route: best, distance: bestDistance };
}

function assignOrdersToDrivers(orders, drivers) {
  const assignments = drivers.map(driver => ({ driver, orders: [] }));
  const maxOrders = Math.ceil(orders.length / drivers.length);
  const ordered = [...orders].sort((a, b) => {
    const coordinateA = orderCoordinate(a);
    const coordinateB = orderCoordinate(b);
    const nearestA = Math.min(...drivers.map(driver => haversineDistance(driver.startCoord, coordinateA)));
    const nearestB = Math.min(...drivers.map(driver => haversineDistance(driver.startCoord, coordinateB)));
    return nearestA - nearestB;
  });
  ordered.forEach(order => {
    const coordinate = orderCoordinate(order);
    const candidates = assignments.filter(assignment => assignment.orders.length < maxOrders);
    const nearest = candidates.reduce((best, candidate) => {
      const previous = candidate.orders.length ? orderCoordinate(candidate.orders[candidate.orders.length - 1]) : candidate.driver.startCoord;
      const cost = haversineDistance(previous, coordinate) + candidate.orders.length * 0.05;
      return !best || cost < best.cost ? { assignment: candidate, cost } : best;
    }, null);
    nearest.assignment.orders.push(order);
  });
  return assignments;
}

function optimizeAssignments(orders, drivers) {
  const assignments = assignOrdersToDrivers(orders, drivers);
  const beforeDistance = assignments.reduce((sum, assignment) => sum + routeDistance(assignment.driver.startCoord, assignment.orders), 0);
  const optimized = assignments.map(assignment => {
    const nearest = nearestNeighborRoute(assignment.driver.startCoord, assignment.orders);
    const result = twoOpt(assignment.driver.startCoord, nearest);
    return {
      driver: assignment.driver,
      orders: result.route.map((order, index) => ({ ...order, routeSequence: index + 1 })),
      distance: Math.round(result.distance * 10) / 10,
      estimatedDuration: Math.round(result.distance * 3)
    };
  });
  const afterDistance = optimized.reduce((sum, assignment) => sum + assignment.distance, 0);
  const before = Math.round(beforeDistance * 10) / 10;
  const after = Math.round(afterDistance * 10) / 10;
  const savings = Math.round((before - after) * 10) / 10;
  return {
    assignments: optimized,
    stats: { totalOrders: orders.length, totalDrivers: drivers.length, beforeDistance: before, afterDistance: after, savings, savingsPct: before ? Math.round((savings / before) * 100) : 0 }
  };
}

module.exports = { haversineDistance, nearestNeighborRoute, routeDistance, twoOpt, assignOrdersToDrivers, optimizeAssignments, orderCoordinate };
