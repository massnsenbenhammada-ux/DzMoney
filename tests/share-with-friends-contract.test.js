const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DAILY_SYSTEM_TASKS,
  isUtcPlusOneCalendarDayAvailable
} = require('../src/services/daily-system-task-contract');
const {
  validateVerificationConfig,
  resolveVerificationConfig
} = require('../src/services/task-verification-config');

test('Share with Friends is a UTC+1 calendar-day daily task', () => {
  assert.equal(DAILY_SYSTEM_TASKS.SHARE_WITH_FRIENDS, 'share_with_friends');
  assert.equal(
    isUtcPlusOneCalendarDayAvailable('2026-08-26T22:59:59.000Z', '2026-08-26T22:59:59.500Z'),
    false
  );
  assert.equal(
    isUtcPlusOneCalendarDayAvailable('2026-08-26T22:59:59.000Z', '2026-08-26T23:00:00.000Z'),
    true
  );
});

test('Share with Friends uses the existing Click Proof verification method and no completion model', () => {
  const config = {
    verification: { method: 'click_proof' },
    systemKey: DAILY_SYSTEM_TASKS.SHARE_WITH_FRIENDS,
    dailyPolicy: 'utc_plus_one_calendar_day'
  };
  assert.equal(validateVerificationConfig(config, 'daily'), true);
  const resolved = resolveVerificationConfig({ taskType: 'daily', config });
  assert.equal(resolved.verification.method, 'click_proof');
  assert.equal(resolved.campaignUrl, null);
  assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'completion'), false);
});

test('Share with Friends does not use a Creator completion mode', () => {
  assert.throws(() => validateVerificationConfig({
    completion: { mode: 'open_link', urlSource: 'user_referral_link' },
    verification: { method: 'click_proof' }
  }, 'daily'), /Legacy completion configuration is not supported/);
});
