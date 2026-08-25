const assert = require('assert');
const { resolveTrustedTaskVerifier } = require('../src/services/task-verification-service');

async function run() {
  const calls = [];
  const verifier = resolveTrustedTaskVerifier({
    config: {
      completion: { mode: 'server_verified' },
      verification: {
        provider: 'telegram_channel',
        channel: '@creator_channel'
      }
    },
    telegramUserId: 123,
    botToken: 'test-token',
    verifyMembership: async args => {
      calls.push(args);
      return true;
    }
  });

  assert.strictEqual(await verifier(), true);
  assert.deepStrictEqual(calls, [{
    botToken: 'test-token',
    channel: '@creator_channel',
    userId: 123
  }]);

  await assert.rejects(
    async () => resolveTrustedTaskVerifier({
      config: {
        completion: { mode: 'server_verified' },
        verification: { provider: 'telegram_channel' }
      },
      telegramUserId: 123,
      botToken: 'test-token'
    }),
    /Telegram task verifier channel is required/
  );

  await assert.rejects(
    async () => resolveTrustedTaskVerifier({
      config: {
        completion: { mode: 'server_verified' },
        verification: { provider: 'telegram_channel', channel: 'not-a-channel' }
      },
      telegramUserId: 123,
      botToken: 'test-token'
    }),
    /Invalid Telegram task verifier channel/
  );

  console.log('Telegram social task verifier invariants: PASS');
}

run().catch(error => {
  console.error('Telegram social task verifier invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
