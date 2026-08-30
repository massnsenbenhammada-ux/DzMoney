const assert = require('assert');

let rewardReached = false;
const attemptRow = {
  id: 11,
  status: 'verification_pending',
  user_id: 42,
  telegramUserId: 123,
  telegram_user_id: 123,
  task_type: 'web',
  reward_coin: '1000',
  reward_dzx: '1',
  reward_dzp: '1',
  config: { campaignUrl: 'https://example.test/task', verification: { method: 'click_proof' } },
  gate_id: 12,
  gate_status: 'ad_completed'
};

const fakeClient = { query: async sql => {
  if (sql.includes('SELECT a.*,u.telegram_user_id')) return { rowCount: 1, rows: [attemptRow] };
  if (sql.includes('SELECT metadata FROM task_attempts')) return { rowCount: 1, rows: [{ metadata: {} }] };
  return { rowCount: 1, rows: [] };
} };

const dbPath = require.resolve('../src/db/pool');
const economyPath = require.resolve('../src/services/economy-service');
const referralPath = require.resolve('../src/services/referral-service');
const adEventPath = require.resolve('../src/services/ad-event-service');
const providerPath = require.resolve('../src/services/ad-provider-service');
const configPath = require.resolve('../src/services/task-verification-config');
const telegramPath = require.resolve('../src/services/telegram-channel-verifier');

require.cache[dbPath] = { exports: { query: fakeClient.query, withTransaction: async work => work(fakeClient) } };
require.cache[economyPath] = { exports: { creditActivityRewardOnClient: async () => { rewardReached = true; throw new Error('reward must not be reached'); } } };
require.cache[referralPath] = { exports: {} };
require.cache[adEventPath] = { exports: {} };
require.cache[providerPath] = { exports: {} };
require.cache[configPath] = { exports: { resolveVerificationConfig: input => input.config } };
require.cache[telegramPath] = { exports: {} };

const { finalizeTaskVerification } = require('../src/services/task-verification-service');

async function run() {
  const result = await finalizeTaskVerification({ attemptId: 11, idempotencyKey: 'task:11' });
  assert.strictEqual(result.status, 'rejected');
  assert.strictEqual(result.rewarded, false);
  assert.strictEqual(rewardReached, false, 'missing click proof must never reach the Economy reward path');

  attemptRow.status = 'expired';
  const expired = await finalizeTaskVerification({ attemptId: 11, idempotencyKey: 'task:11' });
  assert.strictEqual(expired.status, 'expired');
  assert.strictEqual(expired.rewarded, false);
  assert.strictEqual(rewardReached, false, 'expired attempts must never reach the Economy reward path');

  console.log('Task verification security boundary: PASS');
}

run().catch(error => { console.error('Task verification security boundary: FAIL'); console.error(error); process.exitCode = 1; });
