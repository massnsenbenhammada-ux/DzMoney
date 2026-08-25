const assert = require('assert');
const {
  DAILY_SYSTEM_TASKS,
  REFERRAL_ACHIEVEMENT_THRESHOLDS,
  isReferralAchievementClaimable,
} = require('../src/services/daily-system-task-contract');

function testThresholds() {
  assert.deepStrictEqual(REFERRAL_ACHIEVEMENT_THRESHOLDS, {
    [DAILY_SYSTEM_TASKS.INVITE_1_FRIEND]: 1,
    [DAILY_SYSTEM_TASKS.INVITE_10_FRIENDS]: 10,
    [DAILY_SYSTEM_TASKS.INVITE_20_FRIENDS]: 20,
    [DAILY_SYSTEM_TASKS.INVITE_50_FRIENDS]: 50,
    [DAILY_SYSTEM_TASKS.INVITE_100_FRIENDS]: 100,
  });
}

function testEligibilityAndPermanentCompletion() {
  assert.strictEqual(isReferralAchievementClaimable(1, 1, false), true);
  assert.strictEqual(isReferralAchievementClaimable(9, 10, false), false);
  assert.strictEqual(isReferralAchievementClaimable(10, 10, false), true);
  assert.strictEqual(isReferralAchievementClaimable(100, 10, true), false);
}

try {
  testThresholds();
  testEligibilityAndPermanentCompletion();
  console.log('Referral achievement invariants: PASS');
} catch (error) {
  console.error('Referral achievement invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
