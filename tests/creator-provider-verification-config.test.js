const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveVerificationConfig,
  validateVerificationConfig,
  validateCreatorProviderConfiguration,
  CREATOR_VERIFICATION_METHODS,
  getCreatorProviderContracts
} = require('../src/services/task-verification-config');
const { resolveTrustedTaskVerifier } = require('../src/services/task-verification-service');

test('Creator verification methods are canonical and task-specific', () => {
  assert.deepEqual(CREATOR_VERIFICATION_METHODS, {
    game: ['click_proof', 'url_format_match'],
    social: ['click_proof', 'bot_api'],
    web: ['click_proof']
  });
});

test('Game Click Proof uses the canonical campaign URL without a provider contract', () => {
  const config = { campaignUrl: 'https://example.com/game', verification: { method: 'click_proof' } };
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('game', config));
  const resolved = resolveVerificationConfig({ taskType: 'game', config });
  assert.equal(resolved.campaignUrl, config.campaignUrl);
  assert.equal(resolved.verification.method, 'click_proof');
  assert.equal(resolved.verification.provider, null);
});

test('Game URL Format Match uses the single campaign URL as its reference', () => {
  const config = {
    campaignUrl: 'https://t.me/MBuxBot/app?startapp=r_5459324721',
    verification: { method: 'url_format_match' }
  };
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('game', config));
  const resolved = resolveVerificationConfig({ taskType: 'game', config });
  assert.equal(resolved.campaignUrl, config.campaignUrl);
  assert.equal(resolved.verification.method, 'url_format_match');
  assert.equal(resolved.verification.provider, null);
});

test('Web rejects Game-only URL Format Match at the Creator contract boundary', () => {
  assert.throws(() => validateCreatorProviderConfiguration('web', {
    campaignUrl: 'https://example.com',
    verification: { method: 'url_format_match' }
  }), /Invalid verification method for web creator task/);
});

test('Game URL Format Match requires the campaign target URL', () => {
  assert.throws(() => validateCreatorProviderConfiguration('game', {
    verification: { method: 'url_format_match' }
  }), /campaignUrl is required/);
});

test('Game URL Format Match verifier uses campaign URL format and not the exact referral value', async () => {
  const config = {
    campaignUrl: 'https://t.me/MBuxBot/app?startapp=r_5459324721',
    verification: { method: 'url_format_match' }
  };
  const verifier = resolveTrustedTaskVerifier({ config, userSubmittedUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543' });
  assert.equal(await verifier({ attemptId: 1 }), true);
  const mismatch = resolveTrustedTaskVerifier({ config, userSubmittedUrl: 'https://t.me/surf_earn_bot/app?startapp=r_5459324721' });
  assert.equal(await mismatch({ attemptId: 1 }), false);
});

test('Social Bot API uses the existing Telegram provider contract', () => {
  const config = {
    campaignUrl: 'https://t.me/example',
    verification: {
      provider: 'telegram_channel',
      method: 'bot_api',
      event: 'channel_membership',
      requirements: { channel: '@example_channel' }
    }
  };
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('social', config));
  const resolved = resolveVerificationConfig({ taskType: 'social', config });
  assert.equal(resolved.verification.provider, 'telegram_channel');
  assert.equal(resolved.verification.method, 'bot_api');
  assert.equal(resolved.verification.event, 'channel_membership');
  assert.deepEqual(resolved.verification.requirements, { channel: '@example_channel' });
});

test('Creator social contract exposes Telegram Bot API requirements', () => {
  assert.deepEqual(getCreatorProviderContracts('social'), [{
    id: 'telegram_channel',
    label: 'Telegram Bot API',
    method: 'bot_api',
    event: 'channel_membership',
    fields: [{ key: 'channel', label: 'Telegram channel', type: 'telegram_channel', required: true }]
  }]);
});

test('Creator contracts do not expose an unimplemented provider', () => {
  assert.deepEqual(getCreatorProviderContracts('game'), []);
  assert.deepEqual(getCreatorProviderContracts('web'), []);
});

test('Creator configuration rejects the legacy completion model', () => {
  assert.throws(() => validateCreatorProviderConfiguration('social', {
    completion: { mode: 'server_verified', url: 'https://example.com' },
    campaignUrl: 'https://example.com',
    verification: { method: 'bot_api', provider: 'telegram_channel', event: 'channel_membership', requirements: { channel: '@example_channel' } }
  }), /Legacy Creator completion contract is not supported/);
});

test('Telegram creator requirements are consumed directly by the existing verifier', async () => {
  const verifier = resolveTrustedTaskVerifier({
    config: {
      verification: {
        provider: 'telegram_channel',
        method: 'bot_api',
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

test('Provider-backed non-Creator verification remains structural and server-side', () => {
  const config = {
    verification: { provider: 'web-provider-01', method: 'signed_webhook', event: 'registration_completed' }
  };
  assert.doesNotThrow(() => validateVerificationConfig(config, 'web'));
  const resolved = resolveVerificationConfig({ taskType: 'web', config });
  assert.equal(resolved.verification.method, 'signed_webhook');
  assert.equal(resolved.verification.event, 'registration_completed');
});

test('Partner verification remains provider-defined without becoming a Creator method', () => {
  const resolved = resolveVerificationConfig({
    taskType: 'special',
    config: { verification: { provider: 'partner-01', method: 'hmac_callback', event: 'custom_completed' } }
  });
  assert.equal(resolved.verification.method, 'hmac_callback');
  assert.equal(resolved.verification.event, 'custom_completed');
  assert.throws(() => validateCreatorProviderConfiguration('special', resolved), /Invalid creator task type/);
});

test('Unknown verification methods are rejected when no provider contract exists', () => {
  assert.throws(() => validateCreatorProviderConfiguration('game', {
    campaignUrl: 'https://example.com',
    verification: { method: 'client_assertion' }
  }), /Invalid verification method for game creator task/);
});

test('Provider credentials remain forbidden in verification configuration', () => {
  assert.throws(() => validateVerificationConfig({
    verification: { provider: 'x', method: 'signed_webhook', event: 'completed', secret: 'do-not-store' }
  }, 'web'), /credentials must not be stored in task config/);
});
