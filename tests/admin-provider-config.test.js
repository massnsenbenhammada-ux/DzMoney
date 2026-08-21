const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateProviderConfiguration,
} = require('../src/services/admin-provider-config-service');

test('accepts valid provider configuration', () => {
  const config = validateProviderConfiguration({
    providerId: 'adsgram',
    enabled: true,
    priority: 1,
    contexts: ['verification', 'daily_checkin'],
    timeoutMs: 5000,
  }, ['adsgram']);

  assert.deepEqual(config, {
    providerId: 'adsgram',
    enabled: true,
    priority: 1,
    contexts: ['verification', 'daily_checkin'],
    timeoutMs: 5000,
  });
});

test('rejects an unknown provider', () => {
  assert.throws(
    () => validateProviderConfiguration({ providerId: 'unknown', contexts: ['verification'] }, ['adsgram']),
    /registered/
  );
});

test('rejects an invalid context', () => {
  assert.throws(
    () => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['unknown'] }, ['adsgram']),
    /context/
  );
});

test('rejects non-positive timeout and priority', () => {
  assert.throws(
    () => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['verification'], timeoutMs: 0 }, ['adsgram']),
    /timeout/
  );
  assert.throws(
    () => validateProviderConfiguration({ providerId: 'adsgram', contexts: ['verification'], priority: 0 }, ['adsgram']),
    /priority/
  );
});
