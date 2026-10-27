const { timingSafeEqual } = require('node:crypto');

function isValidDispatcherRegistrationCode(supplied, expected = process.env.DISPATCHER_REGISTRATION_CODE) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied.trim());
  const expectedBuffer = Buffer.from(expected.trim());
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

module.exports = { isValidDispatcherRegistrationCode };
