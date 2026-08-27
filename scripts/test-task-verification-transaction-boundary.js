const assert = require('assert');

const calls = [];
let transactionActive = false;

const fakeClient = {
  query: async (sql) => {
    calls.push({ type: 'client.query', sql, transactionActive });
    if (sql.includes('SELECT a.*,u.telegram_user_id')) {
      return { rowCount: 1, rows: [{
        id: 7,
        status: 'verification_pending',
        user_id: 42,
        telegram_user_id: 123,
        task_type: 'social',
        reward_coin: '100',
        reward_dzx: '0',
        reward_dzp: '0',
        config: {
          completion: { mode: 'server_verified' },
          verification: { provider: 'telegram_channel', providerConfigRef: 'telegram.dzmoney_updates' }
        },
        gate_id: 9,
        gate_status: 'ad_completed'
      }] };
    }
    if (sql.includes('UPDATE task_attempts SET status=\'verified\'')) return { rowCount: 1, rows: [] };
    if (sql.includes('UPDATE task_verification_gates SET status=\'verified\'')) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [] };
  }
};

const dbPath = require.resolve('../src/db/pool');
const economyPath = require.resolve('../src/services/economy-service');
const referralPath = require.resolve('../src/services/referral-service');
const adEventPath = require.resolve('../src/services/ad-event-service');
const providerPath = require.resolve('../src/services/ad-provider-service');
const configPath = require.resolve('../src/services/task-verification-config');
const telegramPath = require.resolve('../src/services/telegram-channel-verifier');

require.cache[dbPath] = { exports: {
  query: async sql => {
    calls.push({ type: 'query', sql, transactionActive });
    return fakeClient.query(sql);
  },
  withTransaction: async work => {
    transactionActive = true;
    calls.push({ type: 'transaction.begin' });
    try {
      return await work(fakeClient);
    } finally {
      calls.push({ type: 'transaction.end' });
      transactionActive = false;
    }
  }
} };
require.cache[economyPath] = { exports: {
  creditActivityRewardOnClient: async () => ({ duplicate: false, reward: true })
} };
require.cache[referralPath] = { exports: {
  creditReferralLifetimeOnClient: async () => ({ duplicate: false })
} };
require.cache[adEventPath] = { exports: { markAdvertisementVerified: async () => ({ duplicate: false }) } };
require.cache[providerPath] = { exports: { selectProvider: () => ({ id: 'test' }), verifyWithProvider: async () => ({ verification: { verified: true } }) } };
require.cache[configPath] = { exports: { resolveVerificationConfig: input => input.config } };
require.cache[telegramPath] = { exports: { isTelegramChannelMember: async () => true } };

const { finalizeTaskVerification } = require('../src/services/task-verification-service');

async function run() {
  const result = await finalizeTaskVerification({
    attemptId: 7,
    idempotencyKey: 'task-verification:7',
    verifyTaskCompletion: async () => {
      calls.push({ type: 'external-verifier', transactionActive });
      assert.strictEqual(transactionActive, false, 'external verification must not run inside a DB transaction');
      return true;
    }
  });

  assert.strictEqual(result.status, 'verified');
  const verifierIndex = calls.findIndex(call => call.type === 'external-verifier');
  const transactionIndex = calls.findIndex(call => call.type === 'transaction.begin');
  assert.ok(verifierIndex >= 0);
  assert.ok(transactionIndex > verifierIndex);
  console.log('Task verification transaction boundary: PASS');
}

run().catch(error => {
  console.error('Task verification transaction boundary: FAIL');
  console.error(error);
  process.exitCode = 1;
});
