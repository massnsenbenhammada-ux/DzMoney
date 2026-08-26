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

test('Share with Friends uses server-recorded Open Link / Click Proof with a user referral link source', () => {
  const config = {
    completion: { mode: 'open_link', urlSource: 'user_referral_link' },
    verification: { mode: 'automatic' }
  };
  assert.equal(validateVerificationConfig(config, 'daily'), true);
  assert.deepEqual(resolveVerificationConfig({ taskType: 'daily', config }).completion, {
    mode: 'open_link',
    url: null,
    urlSource: 'user_referral_link'
  });
});
