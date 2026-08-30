const assert = require('assert');
const { query } = require('../src/db/pool');
const {
  DAILY_SYSTEM_TASKS,
  REFERRAL_ACHIEVEMENT_THRESHOLDS,
  isReferralAchievementClaimable,
} = require('../src/services/daily-system-task-contract');

const INVITE_REWARDS = Object.freeze({
  [DAILY_SYSTEM_TASKS.INVITE_1_FRIEND]: { coin: 10000, dzx: 10, dzp: 1 },
  [DAILY_SYSTEM_TASKS.INVITE_10_FRIENDS]: { coin: 100000, dzx: 100, dzp: 10 },
  [DAILY_SYSTEM_TASKS.INVITE_20_FRIENDS]: { coin: 200000, dzx: 200, dzp: 20 },
  [DAILY_SYSTEM_TASKS.INVITE_50_FRIENDS]: { coin: 500000, dzx: 500, dzp: 50 },
  [DAILY_SYSTEM_TASKS.INVITE_100_FRIENDS]: { coin: 1000000, dzx: 1000, dzp: 100 },
});

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

async function testConfiguredInviteRewards() {
  const keys = Object.keys(INVITE_REWARDS);
  const result = await query(`SELECT config->>'systemKey' AS system_key, reward_coin, reward_dzx, reward_dzp, config->>'dailyPolicy' AS daily_policy FROM activity_tasks WHERE task_type='daily' AND config->>'systemKey' = ANY($1::text[])`, [keys]);
  assert.strictEqual(result.rowCount, keys.length, 'All Invite achievement tasks must exist');
  for (const row of result.rows) {
    const expected = INVITE_REWARDS[row.system_key];
    assert.deepStrictEqual({ coin: Number(row.reward_coin), dzx: Number(row.reward_dzx), dzp: Number(row.reward_dzp) }, expected, `Unexpected reward contract for ${row.system_key}`);
    assert.strictEqual(row.daily_policy, 'permanent', `${row.system_key} must remain permanent`);
  }
}

(async () => {
  try {
    testThresholds();
    testEligibilityAndPermanentCompletion();
    await testConfiguredInviteRewards();
    console.log('Referral achievement invariants: PASS');
  } catch (error) {
    console.error('Referral achievement invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
