const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DAILY_SYSTEM_TASKS,
  isRolling24HourAvailable,
  isUtcPlusOneCalendarDayAvailable,
  isReferralAchievementClaimable
} = require('../src/services/daily-system-task-contract');

function testSystemTaskIdentifiers() {
  assert.strictEqual(DAILY_SYSTEM_TASKS.CHECK_IN, 'daily_check_in');
  assert.strictEqual(DAILY_SYSTEM_TASKS.CHECK_FOR_UPDATE, 'check_for_update');
  assert.strictEqual(DAILY_SYSTEM_TASKS.SHARE_WITH_FRIENDS, 'share_with_friends');
  assert.strictEqual(DAILY_SYSTEM_TASKS.VIEW_ADS, 'view_ads');
}

function testRolling24HourCheckin() {
  const previous = '2026-08-25T22:30:00.000Z';
  const beforeWindow = '2026-08-26T22:29:59.999Z';
  const atWindow = '2026-08-26T22:30:00.000Z';
  assert.strictEqual(isRolling24HourAvailable(previous, beforeWindow), false);
  assert.strictEqual(isRolling24HourAvailable(previous, atWindow), true);
}

function testUtcPlusOneCalendarReset() {
  const previous = '2026-08-25T22:30:00.000Z';
  const sameCalendarDay = '2026-08-25T22:59:59.000Z';
  const nextCalendarDay = '2026-08-25T23:30:00.001Z';
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(previous, sameCalendarDay), false);
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(previous, nextCalendarDay), true);
}

function testReferralAchievementIsPermanent() {
  assert.strictEqual(isReferralAchievementClaimable(1, 1, false), true);
  assert.strictEqual(isReferralAchievementClaimable(2, 1, true), false);
  assert.strictEqual(isReferralAchievementClaimable(9, 10, false), false);
  assert.strictEqual(isReferralAchievementClaimable(10, 10, false), true);
}

function testCanonicalCheckinMigrationAndUi() {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '027_daily_checkin_canonical_task.sql'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(migration, /systemKey.*daily_check_in/);
  assert.match(migration, /dailyPolicy.*rolling_24h/);
  assert.match(migration, /dailyMode.*advertisement/);
  assert.doesNotMatch(index, /id="dailyBtn"/);
  assert.match(app, /data-system-key/);
  assert.match(app, /Daily Activity/);
  assert.match(app, /\/api\/daily-tasks\/execute/);
  assert.match(app, /\/api\/daily-tasks\/verify/);
}

try {
  testSystemTaskIdentifiers();
  testRolling24HourCheckin();
  testUtcPlusOneCalendarReset();
  testReferralAchievementIsPermanent();
  testCanonicalCheckinMigrationAndUi();
  console.log('Daily system task lifecycle invariants: PASS');
} catch (error) {
  console.error('Daily system task lifecycle invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}

// The lifecycle contract is intentionally independent of referral activation timing.
