const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDispatcherRegistrationCode } = require('./dispatcherRegistration');

test('dispatcher registration code accepts exact values and pasted surrounding whitespace', () => {
  const previous = process.env.DISPATCHER_REGISTRATION_CODE;
  process.env.DISPATCHER_REGISTRATION_CODE = 'a-secure-code';
  try {
    assert.equal(isValidDispatcherRegistrationCode('a-secure-code'), true);
    assert.equal(isValidDispatcherRegistrationCode('  a-secure-code\r\n'), true);
    assert.equal(isValidDispatcherRegistrationCode('wrong-code'), false);
    assert.equal(isValidDispatcherRegistrationCode(''), false);
  } finally {
    if (previous === undefined) delete process.env.DISPATCHER_REGISTRATION_CODE;
    else process.env.DISPATCHER_REGISTRATION_CODE = previous;
  }
});
