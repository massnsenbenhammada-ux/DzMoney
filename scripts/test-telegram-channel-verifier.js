const assert = require('node:assert/strict');
const { isTelegramChannelMember } = require('../src/services/telegram-channel-verifier');

async function run() {
  const calls = [];
  const request = async url => {
    calls.push(url);
    return { ok: true, result: { status: 'member' } };
  };

  assert.equal(await isTelegramChannelMember({
    botToken: 'token/with+reserved',
    channel: '@creator_channel',
    userId: '12345',
    request
  }), true);
  assert.match(calls[0], /bottoken%2Fwith%2Breserved\/getChatMember/);
  assert.match(calls[0], /chat_id=%40creator_channel/);
  assert.match(calls[0], /user_id=12345/);

  for (const status of ['creator', 'administrator', 'member']) {
    assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: true, result: { status } }) }), true);
  }
  assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: true, result: { status: 'restricted', is_member: true } }) }), true);
  assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: true, result: { status: 'restricted', is_member: false } }) }), false);
  assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: true, result: { status: 'left' } }) }), false);
  assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: false }) }), false);
  assert.equal(await isTelegramChannelMember({ botToken: 'token', channel: '@channel', userId: '1', request: async () => ({ ok: true }) }), false);

  await assert.rejects(() => isTelegramChannelMember({ channel: '@channel', userId: '1', request }), /botToken is required/);
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'token', userId: '1', request }), /channel is required/);
  await assert.rejects(() => isTelegramChannelMember({ botToken: 'token', channel: '@channel', request }), /userId is required/);

  console.log('Telegram channel verifier invariants: PASS');
}

run().catch(error => {
  console.error('Telegram channel verifier invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
