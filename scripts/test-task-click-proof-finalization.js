const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const queryResults = [
  { rowCount: 1, rows: [{ id: 7, status: 'verification_pending', telegram_user_id: '123', task_type: 'game', reward_coin: 1000, reward_dzx: 1, reward_dzp: 1, config: { completion: { mode: 'open_link' } }, gate_id: 8, gate_status: 'ad_completed', metadata: { link_clicked: true } }] },
  { rowCount: 1, rows: [{ id: 7, status: 'verification_pending', telegram_user_id: '123', task_type: 'game', reward_coin: 1000, reward_dzx: 1, reward_dzp: 1, config: { completion: { mode: 'open_link' } }, gate_id: 8, gate_status: 'ad_completed', metadata: { link_clicked: true } }] }
];

Module._load = function(request, parent, isMain) {
  if (request === '../db/pool' || request.endsWith('/db/pool')) {
    return { query: async () => queryResults.shift(), withTransaction: async callback => callback({ query: async sql => {
      if (sql.startsWith('UPDATE task_attempts')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('UPDATE task_verification_gates')) return { rowCount: 1, rows: [] };
      return queryResults.shift() || { rowCount: 1, rows: [] };
    } }) };
  }
  if (request === './economy-service' || request.endsWith('/economy-service')) return { creditActivityRewardOnClient: async () => ({ duplicate: false, reward: { id: 1 } }) };
  if (request === './referral-service' || request.endsWith('/referral-service')) return { creditReferralLifetimeOnClient: async () => ({}) };
  if (request === './ad-event-service' || request.endsWith('/ad-event-service')) return { markAdvertisementVerified: async () => ({ duplicate: false }) };
  if (request === './ad-provider-service' || request.endsWith('/ad-provider-service')) return { selectProvider: () => ({ id: 'test' }), verifyWithProvider: async () => ({ providerId: 'test', verification: { verified: true } }) };
  if (request === './task-verification-config' || request.endsWith('/task-verification-config')) return { resolveVerificationConfig: ({ config }) => config, validateVerificationConfig: () => {} };
  if (request === './telegram-channel-verifier' || request.endsWith('/telegram-channel-verifier')) return { isTelegramChannelMember: async () => true };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const { finalizeTaskVerification } = require('../src/services/task-verification-service');
    const result = await finalizeTaskVerification({ attemptId: 7, idempotencyKey: 'task:7' });
    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.rewarded, true);
    console.log('task-click-proof-finalization: PASS');
  } finally {
    Module._load = originalLoad;
  }
})().catch(error => { console.error(error); process.exit(1); });
