const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DAILY_SYSTEM_TASKS,
  isUtcPlusOneCalendarDayAvailable,
  isReferralAchievementClaimable,
} = require('../src/services/daily-system-task-contract');

test('defines the canonical daily system task identifiers', () => {
  assert.deepEqual(DAILY_SYSTEM_TASKS, {
    CHECK_IN: 'daily_check_in',
    CHECK_FOR_UPDATE: 'check_for_update',
    SHARE_WITH_FRIENDS: 'share_with_friends',
    VIEW_ADS: 'view_ads',
  });
});

test('check-for-update and share reset at UTC+1 calendar-day boundaries', () => {
  const previous = new Date('2026-08-25T00:30:00.000Z');
  const beforeBoundary = new Date('2026-08-25T00:59:59.000Z');
  const afterBoundary = new Date('2026-08-25T01:00:00.000Z');

  assert.equal(isUtcPlusOneCalendarDayAvailable(previous, beforeBoundary), false);
  assert.equal(isUtcPlusOneCalendarDayAvailable(previous, afterBoundary), true);
});

test('referral achievement is claimable only after the threshold and before completion', () => {
  assert.equal(isReferralAchievementClaimable(10, 10, false), true);
  assert.equal(isReferralAchievementClaimable(11, 10, false), true);
  assert.equal(isReferralAchievementClaimable(9, 10, false), false);
  assert.equal(isReferralAchievementClaimable(10, 10, true), false);
});
