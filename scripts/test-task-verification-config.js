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
  assert.throws(() => validateCreatorProviderConfiguration('web', { campaignUrl: 'https://example.test', verification: { method: 'url_format_match' } }), /supported only for Game tasks/);
}

function testDailyClickProof() {
  const resolved = resolveVerificationConfig({ taskType: 'daily', config: { verification: { method: 'click_proof' } } });
  assert.strictEqual(resolved.verification.method, 'click_proof');
  assert.strictEqual(resolved.campaignUrl, null);
}

function testProviderEvidence() {
  const resolved = resolveVerificationConfig({ taskType: 'web', config: { verification: { provider: 'web-provider', method: 'signed_webhook', event: 'registration_completed' } } });
  assert.strictEqual(resolved.verification.provider, 'web-provider');
  assert.strictEqual(resolved.verification.method, 'signed_webhook');
  assert.strictEqual(resolved.verification.event, 'registration_completed');
  assert.throws(() => validateVerificationConfig({ verification: { provider: 'x', event: 'completed' } }, 'web'), /verification method is required/);
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

function testTelegramChannelResolution() {
  const resolved = resolveVerificationConfig({ taskType: 'social', config: { verification: { provider: 'telegram_channel', channel: '@creator_channel' } } });
  assert.strictEqual(resolved.verification.provider, 'telegram_channel');
  assert.strictEqual(resolved.verification.channel, '@creator_channel');
}

try {
  testCanonicalCreatorMethods();
  testLegacyCompletionRejected();
  testCreatorContracts();
  testDailyClickProof();
  testProviderEvidence();
  testReferralModes();
  testReferralTemplateRules();
  testNoSecretsInTaskConfig();
  testTelegramChannelResolution();
  console.log('Task verification configuration invariants: PASS');
} catch (error) {
  console.error('Task verification configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}