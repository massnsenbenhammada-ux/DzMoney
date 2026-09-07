const assert = require('assert');
const referralService = require('../src/services/referral-service');
const { resolveTrustedTaskVerifier } = require('../src/services/task-verification-service');

async function testThresholdVerification() {
  const original = referralService.getQualifiedReferralCount;
  try {
    referralService.getQualifiedReferralCount = async () => 10;
    const verifier = resolveTrustedTaskVerifier({ config: { achievementThreshold: 10 }, telegramUserId: 123 });
    assert.strictEqual(await verifier({}), true, 'Invite should verify at the threshold');

    referralService.getQualifiedReferralCount = async () => 9;
    const belowVerifier = resolveTrustedTaskVerifier({ config: { achievementThreshold: 10 }, telegramUserId: 123 });
    assert.strictEqual(await belowVerifier({}), false, 'Invite must fail below the threshold');

    referralService.getQualifiedReferralCount = async () => 11;
    const aboveVerifier = resolveTrustedTaskVerifier({ config: { achievementThreshold: 10 }, telegramUserId: 123 });
    assert.strictEqual(await aboveVerifier({}), true, 'Invite should verify above the threshold');
  } finally {
    referralService.getQualifiedReferralCount = original;
  }
}

async function testEachInviteThreshold() {
  const original = referralService.getQualifiedReferralCount;
  try {
    for (const threshold of [1, 10, 20, 50, 100]) {
      referralService.getQualifiedReferralCount = async () => threshold;
      const verifier = resolveTrustedTaskVerifier({ config: { achievementThreshold: threshold } });
      assert.strictEqual(await verifier({}), true, `Invite ${threshold} must verify at its threshold`);
    }
  } finally {
    referralService.getQualifiedReferralCount = original;
  }
}

(async () => {
  try {
    await testThresholdVerification();
    await testEachInviteThreshold();
    console.log('Invite achievement verifier: PASS');
  } catch (error) {
    console.error('Invite achievement verifier: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
