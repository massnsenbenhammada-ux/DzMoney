const assert = require('assert');
const {
  DAILY_SYSTEM_TASKS,
  isUtcPlusOneCalendarDayAvailable,
  isReferralAchievementClaimable
} = require('../src/services/daily-system-task-contract');

function testSystemTaskIdentifiers() {
  assert.strictEqual(DAILY_SYSTEM_TASKS.CHECK_FOR_UPDATE, 'check_for_update');
  assert.strictEqual(DAILY_SYSTEM_TASKS.SHARE_WITH_FRIENDS, 'share_with_friends');
  assert.strictEqual(DAILY_SYSTEM_TASKS.VIEW_ADS, 'view_ads');
}

function testUtcPlusOneCalendarReset() {
  const previous = '2026-08-25T22:30:00.000Z';
  const sameCalendarDay = '2026-08-25T23:30:00.000Z';
  const nextCalendarDay = '2026-08-25T23:30:00.001Z';
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(previous, sameCalendarDay), false);
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(previous, nextCalendarDay), false);
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(previous, '2026-08-25T23:30:01.000Z'), true);
}

function testReferralAchievementIsPermanent() {
  assert.strictEqual(isReferralAchievementClaimable(1, 1, false), true);
  assert.strictEqual(isReferralAchievementClaimable(2, 1, true), false);
  assert.strictEqual(isReferralAchievementClaimable(9, 10, false), false);
  assert.strictEqual(isReferralAchievementClaimable(10, 10, false), true);
}

try {
  testSystemTaskIdentifiers();
  testUtcPlusOneCalendarReset();
  testReferralAchievementIsPermanent();
  console.log('Daily system task lifecycle invariants: PASS');
} catch (error) {
  console.error('Daily system task lifecycle invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
