const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isTelegramChannelMember } = require('../src/services/telegram-channel-verifier');

async function testAcceptedMembershipStatuses() {
  const accepted = ['creator', 'administrator', 'member', 'restricted'];
  for (const status of accepted) {
    const result = await isTelegramChannelMember({
      botToken: 'test-token',
      channel: '@DzMoneyChecking',
      userId: 123,
      request: async () => ({ ok: true, result: { status, is_member: status !== 'left' } })
    });
    assert.strictEqual(result, true, `Expected ${status} to verify`);
  }
}

async function testRejectedStatuses() {
  for (const status of ['left', 'kicked']) {
    const result = await isTelegramChannelMember({
      botToken: 'test-token',
      channel: '@DzMoneyChecking',
      userId: 123,
      request: async () => ({ ok: true, result: { status, is_member: false } })
    });
    assert.strictEqual(result, false, `Expected ${status} to reject`);
  }
}

async function testTelegramFailureRejects() {
  const result = await isTelegramChannelMember({
    botToken: 'test-token',
    channel: '@DzMoneyChecking',
    userId: 123,
    request: async () => ({ ok: false, description: 'Forbidden' })
  });
  assert.strictEqual(result, false);
}

async function testRequiredArguments() {
  await assert.rejects(() => isTelegramChannelMember({ channel: '@DzMoneyChecking', userId: 123 }));
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'test-token', userId: 123 }));
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'test-token', channel: '@DzMoneyChecking' }));
}

function testChannelFlowBoundary() {
  const route = fs.readFileSync(path.join(__dirname, '../src/http/daily-system-task-routes.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../public/check-for-update.js'), 'utf8');
  assert.match(route, /systemKey === DAILY_SYSTEM_TASKS\.CHECK_FOR_UPDATE/);
  assert.match(route, /actionUrl: 'https:\/\/t\.me\/DzMoneyChecking'/);
  assert.match(route, /verificationAdId: null/);
  assert.match(frontend, /openChannel\(pendingActionUrl\)/);
  assert.match(frontend, /openTelegramLink/);
  assert.match(frontend, /document\.addEventListener\('visibilitychange', verifyOnReturn\)/);
  assert.match(frontend, /window\.addEventListener\('focus', verifyOnReturn\)/);
  assert.match(frontend, /verificationAdId !== null/);
  assert.doesNotMatch(frontend, /showTaskVerificationAd/);
}

(async () => {
  await testAcceptedMembershipStatuses();
  await testRejectedStatuses();
  await testTelegramFailureRejects();
  await testRequiredArguments();
  testChannelFlowBoundary();
  console.log('Daily Check for Update verification invariants: PASS');
})().catch(error => {
  console.error('Daily Check for Update verification invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
