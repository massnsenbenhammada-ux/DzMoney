const assert = require('assert');
const {
  REFERRAL_MODES,
  TASK_TYPES,
  CREATOR_VERIFICATION_METHODS,
  resolveVerificationConfig,
  validateVerificationConfig,
  validateCreatorProviderConfiguration
} = require('../src/services/task-verification-config');

function testCanonicalCreatorMethods() {
  assert.deepStrictEqual(CREATOR_VERIFICATION_METHODS, {
    game: ['click_proof', 'url_format_match'],
    social: ['click_proof', 'bot_api'],
    web: ['click_proof']
  });
  assert.deepStrictEqual(TASK_TYPES, ['daily', 'game', 'social', 'web', 'special']);
}

function testLegacyCompletionRejected() {
  assert.throws(() => validateVerificationConfig({ completion: { mode: 'open_link', url: 'https://example.test' } }, 'web'), /Legacy completion configuration is not supported/);
  assert.throws(() => validateCreatorProviderConfiguration('game', {
    completion: { mode: 'server_verified', url: 'https://example.test' },
    campaignUrl: 'https://example.test',
    verification: { method: 'click_proof' }
  }), /Legacy Creator completion contract is not supported/);
  const resolved = resolveVerificationConfig({ taskType: 'game', config: { campaignUrl: 'https://example.test', verification: { method: 'click_proof' } } });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(resolved, 'completion'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(resolved, 'serverVerified'), false);
}

function testCreatorContracts() {
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('game', { campaignUrl: 'https://example.test', verification: { method: 'click_proof' } }));
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('game', { campaignUrl: 'https://example.test', verification: { method: 'url_format_match' } }));
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('social', { campaignUrl: 'https://example.test', verification: { method: 'bot_api', provider: 'telegram_channel', event: 'channel_membership', requirements: { channel: '@example_channel' } } }));
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('web', { campaignUrl: 'https://example.test', verification: { method: 'click_proof' } }));
  assert.throws(() => validateCreatorProviderConfiguration('web', { campaignUrl: 'https://example.test', verification: { method: 'url_format_match' } }), /Invalid verification method for web creator task/);
}

function testDailyClickProof() {
  const resolved = resolveVerificationConfig({ taskType: 'daily', config: { verification: { method: 'click_proof' } } });
  assert.strictEqual(resolved.verification.method, 'click_proof');
  assert.strictEqual(resolved.campaignUrl, null);
}

function testDailyAdvertisementModePreserved() {
  const resolved = resolveVerificationConfig({
    taskType: 'daily',
    config: {
      systemKey: 'daily_check_in',
      dailyPolicy: 'rolling_24h',
      dailyMode: 'advertisement',
      verification: {}
    }
  });
  assert.strictEqual(resolved.dailyMode, 'advertisement');
}

function testUnsupportedCreatorMethodsRejected() {
  assert.throws(
    () => validateCreatorProviderConfiguration('web', {
      campaignUrl: 'https://example.test',
      verification: { method: 'signed_webhook', provider: 'web-provider', event: 'registration_completed' }
    }),
    /Invalid verification method for web creator task/
  );
  assert.throws(
    () => validateCreatorProviderConfiguration('social', {
      campaignUrl: 'https://example.test',
      verification: { method: 'telegram_bot_api', provider: 'telegram_channel', event: 'channel_membership', requirements: { channel: '@example_channel' } }
    }),
    /Invalid verification method for social creator task/
  );
}

function testGenericProviderValidation() {
  assert.throws(
    () => validateVerificationConfig({ verification: { provider: 'x', event: 'completed' } }, 'web'),
    /verification method is required/
  );
}

function testReferralModes() {
  assert.deepStrictEqual(REFERRAL_MODES, ['disabled', 'link_only', 'link_and_owner_verification']);
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: {} }).referral.mode, 'disabled');
  assert.strictEqual(resolveVerificationConfig({ taskType: 'social', config: { referral: { mode: 'link_only', referralUrlTemplate: 'https://example.test/register?ref={code}' } } }).referral.mode, 'link_only');
  assert.strictEqual(resolveVerificationConfig({ taskType: 'social', config: { referral: { mode: 'link_and_owner_verification', referralUrlTemplate: 'https://example.test/register?ref={code}', ownerVerification: { provider: 'partner' } } } }).referral.mode, 'link_and_owner_verification');
}

function testReferralTemplateRules() {
  assert.throws(() => validateVerificationConfig({ referral: { mode: 'link_only' } }), /referralUrlTemplate is required/);
  assert.throws(() => validateVerificationConfig({ referral: { mode: 'link_and_owner_verification', referralUrlTemplate: 'https://example.test/register' } }), /owner verification configuration is required/);
}

function testNoSecretsInTaskConfig() {
  assert.throws(() => validateVerificationConfig({ verification: { apiKey: 'secret' } }), /credentials must not be stored in task config/);
  assert.throws(() => validateVerificationConfig({ referral: { ownerVerification: { provider: 'partner', credentials: { token: 'secret' } } } }), /credentials must not be stored in task config/);
}

function testTelegramBotApiContract() {
  const config = {
    taskType: 'social',
    config: {
      campaignUrl: 'https://example.test',
      verification: {
        method: 'bot_api',
        provider: 'telegram_channel',
        event: 'channel_membership',
        requirements: { channel: '@creator_channel' }
      }
    }
  };
  const resolved = resolveVerificationConfig(config);
  assert.strictEqual(resolved.verification.method, 'bot_api');
  assert.strictEqual(resolved.verification.provider, 'telegram_channel');
  assert.strictEqual(resolved.verification.event, 'channel_membership');
  assert.strictEqual(resolved.verification.requirements.channel, '@creator_channel');
}

try {
  testCanonicalCreatorMethods();
  testLegacyCompletionRejected();
  testCreatorContracts();
  testDailyClickProof();
  testDailyAdvertisementModePreserved();
  testUnsupportedCreatorMethodsRejected();
  testGenericProviderValidation();
  testReferralModes();
  testReferralTemplateRules();
  testNoSecretsInTaskConfig();
  testTelegramBotApiContract();
  console.log('Task verification configuration invariants: PASS');
} catch (error) {
  console.error('Task verification configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}