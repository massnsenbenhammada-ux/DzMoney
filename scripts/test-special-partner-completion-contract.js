const assert = require('assert');
const {
  validateVerificationConfig,
  resolveVerificationConfig
} = require('../src/services/task-verification-config');

function testSpecialPartnerRejectsClickProof() {
  assert.throws(
    () => validateVerificationConfig(
      { completion: { mode: 'open_link', url: 'https://partner.example/task' } },
      'special'
    ),
    /Special\/Partner tasks require server_verified completion/
  );
}

function testSpecialPartnerAllowsServerVerified() {
  assert.strictEqual(
    validateVerificationConfig(
      { completion: { mode: 'server_verified' } },
      'special'
    ),
    true
  );
  assert.strictEqual(
    resolveVerificationConfig({
      taskType: 'special',
      config: { completion: { mode: 'server_verified' } }
    }).completion.mode,
    'server_verified'
  );
}

try {
  testSpecialPartnerRejectsClickProof();
  testSpecialPartnerAllowsServerVerified();
  console.log('Special/Partner completion contract invariants: PASS');
} catch (error) {
  console.error('Special/Partner completion contract invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
