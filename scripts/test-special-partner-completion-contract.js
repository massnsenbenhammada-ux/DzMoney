const assert = require('assert');
const {
  validateVerificationConfig,
  resolveVerificationConfig,
  validateCreatorProviderConfiguration
} = require('../src/services/task-verification-config');

function testSpecialPartnerIsNotACreatorContract() {
  assert.throws(
    () => validateCreatorProviderConfiguration('special', {
      verification: { method: 'click_proof' },
      campaignUrl: 'https://partner.example/task'
    }),
    /Invalid creator task type/
  );
}

function testSpecialPartnerUsesProviderDefinedEvidence() {
  const config = {
    verification: {
      provider: 'partner-01',
      method: 'hmac_callback',
      event: 'custom_completed'
    }
  };
  assert.doesNotThrow(() => validateVerificationConfig(config, 'special'));
  const resolved = resolveVerificationConfig({ taskType: 'special', config });
  assert.equal(resolved.verification.provider, 'partner-01');
  assert.equal(resolved.verification.method, 'hmac_callback');
  assert.equal(resolved.verification.event, 'custom_completed');
  assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'completion'), false);
}

function testLegacySpecialCompletionIsRejected() {
  assert.throws(
    () => validateVerificationConfig({ completion: { mode: 'server_verified' } }, 'special'),
    /Legacy completion configuration is not supported/
  );
}

try {
  testSpecialPartnerIsNotACreatorContract();
  testSpecialPartnerUsesProviderDefinedEvidence();
  testLegacySpecialCompletionIsRejected();
  console.log('Special/Partner verification contract invariants: PASS');
} catch (error) {
  console.error('Special/Partner verification contract invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}