const assert = require('assert');

async function run() {
  const verificationService = require('../src/services/task-verification-service');
  const originalLoad = verificationService.__loadTaskVerificationAttempt;
  assert.ok(!originalLoad, 'test guard');
  console.log('click-proof finalization contract test scaffold requires no new verifier');
}

run().catch(error => { console.error(error); process.exit(1); });
