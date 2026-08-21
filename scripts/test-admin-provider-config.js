const assert = require('assert');
const { validateProviderConfiguration } = require('../src/services/admin-provider-config-service');

function testValidConfiguration() {
  assert.deepStrictEqual(validateProviderConfiguration({
    providerId: 'adsgram',
    enabled: true,
    priority: 1,
    contexts: ['verification', 'daily_checkin'],
    timeoutMs: 5000,
  }, ['adsgram']), {
    providerId: 'adsgram',
    enabled: true,
    priority: 1,
    contexts: ['verification', 'daily_checkin'],
    timeoutMs: 5000,
  });
}

function testValidationFailures() {
  assert.throws(() => validateProviderConfiguration({ providerId: 'unknown', contexts: ['verification'] }, ['adsgram']), /registered/);
  assert.throws(() => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['unknown'] }, ['adsgram']), /context/);
  assert.throws(() => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['verification'], timeoutMs: 0 }, ['adsgram']), /timeout/);
  assert.throws(() => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['verification'], priority: 0 }, ['adsgram']), /priority/);
}

try {
  testValidConfiguration();
  testValidationFailures();
  console.log('Admin provider configuration invariants: PASS');
} catch (error) {
  console.error('Admin provider configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
