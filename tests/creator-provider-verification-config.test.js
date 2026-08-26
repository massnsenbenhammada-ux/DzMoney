const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveVerificationConfig, validateVerificationConfig, VERIFICATION_METHODS } = require('../src/services/task-verification-config');

test('provider-ready creator task config accepts a game Mini App contract', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'game',
    config: {
      verification: {
        mode: 'automatic',
        provider: 'game-provider-01',
        providerConfigRef: 'provider-config-01',
        method: 'signed_webhook',
        event: 'game_completed'
      }
    }
  });
  assert.equal(resolved.verification.provider, 'game-provider-01');
  assert.equal(resolved.verification.method, 'signed_webhook');
  assert.equal(resolved.verification.event, 'game_completed');
});

test('provider-ready creator task config accepts Telegram social evidence', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'social',
    config: {
      verification: {
        provider: 'telegram',
        method: 'telegram_bot_api',
        event: 'channel_membership'
      }
    }
  });
  assert.equal(resolved.verification.method, 'telegram_bot_api');
  assert.equal(resolved.verification.event, 'channel_membership');
});

test('provider-ready creator task config accepts web webhook evidence', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'web',
    config: {
      verification: {
        provider: 'web-provider-01',
        method: 'signed_webhook',
        event: 'registration_completed'
      }
    }
  });
  assert.equal(resolved.verification.method, 'signed_webhook');
  assert.equal(resolved.verification.event, 'registration_completed');
});

test('special partner tasks accept provider-ready evidence configuration', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'special',
    config: {
      verification: {
        provider: 'partner-01',
        method: 'hmac_callback',
        event: 'custom_completed'
      }
    }
  });
  assert.equal(resolved.verification.method, 'hmac_callback');
  assert.equal(resolved.verification.event, 'custom_completed');
});

test('unknown verification methods are rejected', () => {
  assert.throws(() => validateVerificationConfig({
    verification: { provider: 'x', method: 'client_assertion', event: 'completed' }
  }, 'game'), /Invalid verification method/);
});

test('provider credentials remain forbidden in verification configuration', () => {
  assert.throws(() => validateVerificationConfig({
    verification: { provider: 'x', method: 'signed_webhook', event: 'completed', secret: 'do-not-store' }
  }, 'web'), /credentials must not be stored in task config/);
});

assert.deepEqual(VERIFICATION_METHODS, [
  'api',
  'webhook',
  'callback',
  'telegram_bot_api',
  'token_callback',
  'signed_webhook',
  'hmac_callback'
]);
