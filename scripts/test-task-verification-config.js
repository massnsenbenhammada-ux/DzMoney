const assert = require('assert');
const {
  REFERRAL_MODES,
  VERIFICATION_MODES,
  COMPLETION_MODES,
  resolveVerificationConfig,
  validateVerificationConfig
} = require('../src/services/task-verification-config');

function testVerificationModes() {
  assert.deepStrictEqual(VERIFICATION_MODES, ['automatic', 'custom']);
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: {} }).verification.mode, 'automatic');
  assert.strictEqual(resolveVerificationConfig({
    taskType: 'web',
    config: { verification: { mode: 'custom', provider: 'partner' } }
  }).verification.mode, 'custom');
  assert.throws(
    () => validateVerificationConfig({ verification: { mode: 'unknown' } }),
    /Invalid verification mode/
  );
}

function testCompletionModes() {
  assert.deepStrictEqual(COMPLETION_MODES, ['open_link', 'server_verified']);
  const defaultConfig = resolveVerificationConfig({ taskType: 'daily', config: {} });
  assert.strictEqual(defaultConfig.completion.mode, 'server_verified');
  assert.strictEqual(defaultConfig.completion.url, null);

  const openLink = resolveVerificationConfig({
    taskType: 'web',
    config: { completion: { mode: 'open_link', url: 'https://example.test/task' } }
  });
  assert.strictEqual(openLink.completion.mode, 'open_link');
  assert.strictEqual(openLink.completion.url, 'https://example.test/task');

  assert.throws(
    () => validateVerificationConfig({ completion: { mode: 'open_link' } }),
    /completion.url is required for open_link tasks/
  );
  assert.throws(
    () => validateVerificationConfig({ completion: { mode: 'unknown' } }),
    /Invalid task completion mode/
  );
}

function testReferralModes() {
  assert.deepStrictEqual(REFERRAL_MODES, ['disabled', 'link_only', 'link_and_owner_verification']);
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: {} }).referral.mode, 'disabled');
  assert.strictEqual(resolveVerificationConfig({
    taskType: 'social',
    config: { referral: { mode: 'link_only', referralUrlTemplate: 'https://example.test/register?ref={code}' } }
  }).referral.mode, 'link_only');
  assert.strictEqual(resolveVerificationConfig({
    taskType: 'social',
    config: {
      referral: {
        mode: 'link_and_owner_verification',
        referralUrlTemplate: 'https://example.test/register?ref={code}',
        ownerVerification: { provider: 'partner' }
      }
    }
  }).referral.mode, 'link_and_owner_verification');
}

function testAutomaticDefaults() {
  const ads = resolveVerificationConfig({ taskType: 'daily', config: { verification: { provider: 'ads' } } });
  assert.strictEqual(ads.verification.mode, 'automatic');
  assert.strictEqual(ads.verification.provider, 'ads');
}

function testReferralTemplateRules() {
  assert.throws(
    () => validateVerificationConfig({ referral: { mode: 'link_only' } }),
    /referralUrlTemplate is required/
  );
  assert.throws(
    () => validateVerificationConfig({ referral: { mode: 'link_and_owner_verification', referralUrlTemplate: 'https://example.test/register' } }),
    /owner verification configuration is required/
  );
}

function testNoSecretsInTaskConfig() {
  assert.throws(
    () => validateVerificationConfig({ verification: { apiKey: 'secret' } }),
    /credentials must not be stored in task config/
  );
  assert.throws(
    () => validateVerificationConfig({
      referral: { ownerVerification: { provider: 'partner', credentials: { token: 'secret' } } }
    }),
    /credentials must not be stored in task config/
  );
}

function testTelegramChannelResolution() {
  const resolved = resolveVerificationConfig({
    taskType: 'social',
    config: {
      verification: {
        provider: 'telegram_channel',
        channel: '@creator_channel'
      }
    }
  });
  assert.strictEqual(resolved.verification.provider, 'telegram_channel');
  assert.strictEqual(resolved.verification.channel, '@creator_channel');
}

try {
  testVerificationModes();
  testCompletionModes();
  testReferralModes();
  testAutomaticDefaults();
  testReferralTemplateRules();
  testNoSecretsInTaskConfig();
  testTelegramChannelResolution();
  console.log('Task verification configuration invariants: PASS');
} catch (error) {
  console.error('Task verification configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
