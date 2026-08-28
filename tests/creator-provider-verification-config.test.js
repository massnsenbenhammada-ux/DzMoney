const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveVerificationConfig,
  validateVerificationConfig,
  validateCreatorProviderConfiguration,
  VERIFICATION_METHODS,
  getCreatorProviderContracts
} = require('../src/services/task-verification-config');
const { resolveTrustedTaskVerifier } = require('../src/services/task-verification-service');

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

test('Game URL Format Match uses the single campaign URL as its reference', () => {
  const config = {
    completion: { mode: 'server_verified', url: 'https://t.me/MBuxBot/app?startapp=r_5459324721' },
    verification: { method: 'url_format_match' }
  };
  assert.doesNotThrow(() => validateVerificationConfig(config, 'game'));
  const resolved = resolveVerificationConfig({ taskType: 'game', config });
  assert.equal(resolved.completion.url, config.completion.url);
  assert.equal(resolved.verification.method, 'url_format_match');
  assert.equal(resolved.verification.provider, null);
});

test('Game URL Format Match cannot be configured for another task type', () => {
  assert.throws(() => validateVerificationConfig({
    completion: { mode: 'server_verified', url: 'https://example.com' },
    verification: { method: 'url_format_match' }
  }, 'web'), /supported only for Game tasks/);
});

test('Game URL Format Match requires the campaign target URL', () => {
  assert.throws(() => validateVerificationConfig({
    verification: { method: 'url_format_match' }
  }, 'game'), /completion.url is required/);
});

test('Game URL Format Match verifier uses campaign URL format and not the exact referral value', async () => {
  const config = {
    completion: { mode: 'server_verified', url: 'https://t.me/MBuxBot/app?startapp=r_5459324721' },
    verification: { method: 'url_format_match' }
  };
  const verifier = resolveTrustedTaskVerifier({ config, userSubmittedUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543' });
  assert.equal(await verifier({ attemptId: 1 }), true);
  const mismatch = resolveTrustedTaskVerifier({ config, userSubmittedUrl: 'https://t.me/surf_earn_bot/app?startapp=r_5459324721' });
  assert.equal(await mismatch({ attemptId: 1 }), false);
});

test('provider-ready creator task config accepts Telegram social evidence', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'social',
    config: {
      verification: {
        provider: 'telegram_channel',
        method: 'telegram_bot_api',
        event: 'channel_membership',
        requirements: { channel: '@example_channel' }
      }
    }
  });
  assert.equal(resolved.verification.provider, 'telegram_channel');
  assert.equal(resolved.verification.method, 'telegram_bot_api');
  assert.equal(resolved.verification.event, 'channel_membership');
  assert.deepEqual(resolved.verification.requirements, { channel: '@example_channel' });
});

test('creator social contract exposes Telegram Bot API requirements', () => {
  const contracts = getCreatorProviderContracts('social');
  assert.deepEqual(contracts, [{
    id: 'telegram_channel',
    label: 'Telegram Bot API',
    method: 'telegram_bot_api',
    event: 'channel_membership',
    fields: [{
      key: 'channel',
      label: 'Telegram channel',
      type: 'telegram_channel',
      required: true
    }]
  }]);
});

test('creator contracts do not expose an unimplemented provider', () => {
  assert.deepEqual(getCreatorProviderContracts('game'), []);
  assert.deepEqual(getCreatorProviderContracts('web'), []);
});

test('Creator Server Verified accepts only an enabled provider contract', () => {
  const config = {
    completion: { mode: 'server_verified', url: 'https://example.com' },
    verification: {
      provider: 'telegram_channel',
      method: 'telegram_bot_api',
      event: 'channel_membership',
      requirements: { channel: '@example_channel' }
    }
  };
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('social', config));
  assert.throws(() => validateCreatorProviderConfiguration('game', config), /No server-verified provider is enabled/);
  assert.throws(() => validateCreatorProviderConfiguration('social', { ...config, verification: { ...config.verification, provider: 'unknown' } }), /provider is not enabled/);
  assert.throws(() => validateCreatorProviderConfiguration('social', { ...config, verification: { ...config.verification, method: 'webhook' } }), /method does not match/);
});

test('Telegram Bot API channel requirement is validated', () => {
  assert.doesNotThrow(() => validateVerificationConfig({
    completion: { mode: 'server_verified', url: 'https://example.com' },
    verification: {
      provider: 'telegram_channel',
      method: 'telegram_bot_api',
      event: 'channel_membership',
      requirements: { channel: '@example_channel' }
    }
  }, 'social'));
  assert.throws(() => validateCreatorProviderConfiguration('social', {
    completion: { mode: 'server_verified', url: 'https://example.com' },
    verification: {
      provider: 'telegram_channel',
      method: 'telegram_bot_api',
      event: 'channel_membership',
      requirements: { channel: 'not-a-channel' }
    }
  }), /Invalid Telegram channel requirement/);
});

test('Telegram creator requirements are consumed directly by the existing verifier', async () => {
  const verifier = resolveTrustedTaskVerifier({
    config: {
      verification: {
        provider: 'telegram_channel',
        method: 'telegram_bot_api',
        event: 'channel_membership',
        requirements: { channel: '@creator_channel' }
      }
    },
    telegramUserId: '12345',
    botToken: 'server-only-token',
    verifyMembership: async input => {
      assert.deepEqual(input, { botToken: 'server-only-token', channel: '@creator_channel', userId: '12345' });
      return true;
    }
  });
  assert.equal(await verifier({ attemptId: 1 }), true);
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
  'hmac_callback',
  'url_format_match'
]);