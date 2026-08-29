const assert = require('assert');
const { resolveTrustedTaskVerifier } = require('../src/services/task-verification-service');

async function run() {
  const calls = [];
  const verifier = resolveTrustedTaskVerifier({
    config: {
      verification: { provider: 'telegram_channel', method: 'bot_api', providerConfigRef: 'telegram.dzmoney_updates' }
    },
    telegramUserId: 123,
    botToken: 'test-token',
    verifyMembership: async args => {
      calls.push(args);
      return true;
    }
  });

  assert.strictEqual(typeof verifier, 'function');
  assert.strictEqual(await verifier(), true);
  assert.deepStrictEqual(calls, [{
    botToken: 'test-token',
    channel: '@dzmoneycom',
    userId: 123
  }]);

  assert.throws(() => resolveTrustedTaskVerifier({
    config: { verification: { method: 'bot_api' } },
    telegramUserId: 123,
    botToken: 'test-token'
  }), /trusted task verifier provider is required/);

  assert.throws(() => resolveTrustedTaskVerifier({
    config: { verification: { provider: 'unknown', method: 'bot_api', providerConfigRef: 'x' } },
    telegramUserId: 123,
    botToken: 'test-token'
  }), /Unsupported trusted task verifier provider/);

  assert.throws(() => resolveTrustedTaskVerifier({
    config: { verification: { provider: 'telegram_channel', method: 'bot_api', providerConfigRef: 'telegram.dzmoney_updates' } },
    telegramUserId: 123
  }), /BOT_TOKEN is required/);

  console.log('Trusted task verifier invariants: PASS');
}

run().catch(error => {
  console.error('Trusted task verifier invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});