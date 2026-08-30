const assert = require('assert');
const { DAILY_SYSTEM_TASKS, isUtcPlusOneCalendarDayAvailable } = require('../src/services/daily-system-task-contract');
const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'services', 'daily-system-task-service.js'), 'utf8');
const migration = require('fs').readFileSync(require('path').join(__dirname, '..', 'migrations', '029_daily_view_ads_target.sql'), 'utf8');

function testViewAdsIdentifier() {
  assert.strictEqual(DAILY_SYSTEM_TASKS.VIEW_ADS, 'view_ads');
}

function testViewAdsUsesCalendarDayNotRollingCooldown() {
  const completedAt = '2026-08-25T22:30:00.000Z';
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(completedAt, '2026-08-25T22:59:59.000Z'), false);
  assert.strictEqual(isUtcPlusOneCalendarDayAvailable(completedAt, '2026-08-25T23:00:00.000Z'), true);
}

function testViewAdsHasTwentyAdTargetAndServerProgress() {
  assert.match(migration, /advertisementTarget.*20/);
  assert.match(source, /advertisementTarget/);
  assert.match(source, /COUNT\(\*\)/);
  assert.match(source, /verified=TRUE/);
}

function testViewAdsDoesNotReuseVerificationGate() {
  assert.doesNotMatch(source, /task_verification_gates/);
}

try {
  testViewAdsIdentifier();
  testViewAdsUsesCalendarDayNotRollingCooldown();
  testViewAdsHasTwentyAdTargetAndServerProgress();
  testViewAdsDoesNotReuseVerificationGate();
  console.log('Daily View Ads invariants: PASS');
} catch (error) {
  console.error('Daily View Ads invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}