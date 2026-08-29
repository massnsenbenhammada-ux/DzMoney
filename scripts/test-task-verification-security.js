const assert = require('assert');

let transactionStarted = false;
const fakeClient = { query: async sql => {
  if (sql.includes('SELECT a.*,u.telegram_user_id')) {
    return { rowCount: 1, rows: [{ id: 11, status: 'verification_pending', user_id: 42, telegram_user_id: 123, task_type: 'web', reward_coin: '1000', reward_dzx: '1', reward_dzp: '1', config: { campaignUrl: 'https://example.test/task', verification: { method: 'click_proof' } }, gate_id: 12, gate_status: 'ad_completed' }] };
  }
  return { rowCount: 1, rows: [] };
} };

const dbPath = require.resolve('../src/db/pool');
const economyPath = require.resolve('../src/services/economy-service');
const referralPath = require.resolve('../src/services/referral-service');
const adEventPath = require.resolve('../src/services/ad-event-service');
const providerPath = require.resolve('../src/services/ad-provider-service');
const configPath = require.resolve('../src/services/task-verification-config');
const telegramPath = require.resolve('../src/services/telegram-channel-verifier');

require.cache[dbPath] = { exports: { query: fakeClient.query, withTransaction: async work => { transactionStarted = true; return work(fakeClient); } } };
require.cache[economyPath] = { exports: { creditActivityRewardOnClient: async () => { throw new Error('reward must not be reached'); } } };
require.cache[referralPath] = { exports: {} };
require.cache[adEventPath] = { exports: {} };
require.cache[providerPath] = { exports: {} };
require.cache[configPath] = { exports: { resolveVerificationConfig: input => input.config } };
require.cache[telegramPath] = { exports: {} };

const { finalizeTaskVerification } = require('../src/services/task-verification-service');

async function run() {
  await assert.rejects(
    () => finalizeTaskVerification({ attemptId: 11, idempotencyKey: 'task:11' }),
    result => result instanceof Error && result.message === 'Task verifier must return a boolean'
  );
  assert.strictEqual(transactionStarted, false, 'missing click proof must not reach reward transaction');
  console.log('Task verification security boundary: PASS');
}

run().catch(error => { console.error('Task verification security boundary: FAIL'); console.error(error); process.exitCode = 1; });