const assert = require('assert');
const { isTelegramChannelMember } = require('../src/services/telegram-channel-verifier');

async function testAcceptedMembershipStatuses() {
  const accepted = ['creator', 'administrator', 'member', 'restricted'];
  for (const status of accepted) {
    const result = await isTelegramChannelMember({
      botToken: 'test-token',
      channel: '@dzmoneycom',
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
      channel: '@dzmoneycom',
      userId: 123,
      request: async () => ({ ok: true, result: { status, is_member: false } })
    });
    assert.strictEqual(result, false, `Expected ${status} to reject`);
  }
}

async function testTelegramFailureRejects() {
  const result = await isTelegramChannelMember({
    botToken: 'test-token',
    channel: '@dzmoneycom',
    userId: 123,
    request: async () => ({ ok: false, description: 'Forbidden' })
  });
  assert.strictEqual(result, false);
}

async function testRequiredArguments() {
  await assert.rejects(() => isTelegramChannelMember({ channel: '@dzmoneycom', userId: 123 }));
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'test-token', userId: 123 }));
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'test-token', channel: '@dzmoneycom' }));
}

(async () => {
  await testAcceptedMembershipStatuses();
  await testRejectedStatuses();
  await testTelegramFailureRejects();
  await testRequiredArguments();
  console.log('Daily Check for Update verification invariants: PASS');
})().catch(error => {
  console.error('Daily Check for Update verification invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
