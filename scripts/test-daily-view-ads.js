const assert = require('assert');
const { DAILY_SYSTEM_TASKS, isUtcPlusOneCalendarDayAvailable } = require('../src/services/daily-system-task-contract');

function testViewAdsIdentifier() {
  assert.strictEqual(DAILY_SYSTEM_TASKS.VIEW_ADS, 'view_ads');
}

function testViewAdsUsesCalendarDayNotRollingCooldown() {
  const completedAt = '2026-08-25T22:30:00.000Z';
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(completedAt, '2026-08-25T22:59:59.000Z'), false);
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(completedAt, '2026-08-25T23:00:00.000Z'), true);
}

try {
  testViewAdsIdentifier();
  testViewAdsUsesCalendarDayNotRollingCooldown();
  console.log('Daily View Ads invariants: PASS');
} catch (error) {
  console.error('Daily View Ads invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
