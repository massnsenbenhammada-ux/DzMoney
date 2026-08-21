const assert = require('assert');
const {
  REFERRAL_MODES,
  resolveVerificationConfig,
  validateVerificationConfig
} = require('../src/services/task-verification-config');

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
}

try {
  testReferralModes();
  testAutomaticDefaults();
  testReferralTemplateRules();
  testNoSecretsInTaskConfig();
  console.log('Task verification configuration invariants: PASS');
} catch (error) {
  console.error('Task verification configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
