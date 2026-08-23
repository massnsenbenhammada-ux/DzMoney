const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { createTask, transitionTaskStatus, activateTask, executeTask } = require('../src/services/task-service');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { startTaskVerificationAd, verifyTaskAdvertisement, finalizeTaskVerification } = require('../src/services/task-verification-service');

const testAdsProvider = {
  id: 'test-ads',
  contexts: ['verification'],
  async verifyCompletion(payload) {
    if (!payload || payload.accepted !== true) return { verified: false };
    return { verified: true, reference: payload.reference, metadata: { test: true } };
  }
};

const adProviderRegistry = new AdProviderRegistry([testAdsProvider]);

async function createTestUser() {
  const marker = Date.now();
  const result = await pool.query(`INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id`, [String(marker), `phase2_${marker}`, 'Phase 2 Test']);
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) await client.query(`INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2) ON CONFLICT (user_id,currency) DO NOTHING`, [userId, currency]);
  });
  return userId;
}

async function balance(userId, currency) {
  const result = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2', [userId, currency]);
  return Number(result.rows[0].balance);
}

async function cleanupTestData(userId, taskIds) {
  await withTransaction(async client => {
    await client.query(`DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=$1)`, [userId]);
    await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM task_attempts WHERE user_id=$1', [userId]);
    if (taskIds.length) await client.query('DELETE FROM activity_tasks WHERE id = ANY($1::bigint[])', [taskIds]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function startVerificationAd(attemptId, idempotencyKey, externalAdId) {
  return startTaskVerificationAd({ attemptId, idempotencyKey, externalAdId, providerRegistry: adProviderRegistry });
}

async function verifyAd(adEventId, providerPayload) {
  return verifyTaskAdvertisement({ adEventId, providerRegistry: adProviderRegistry, providerPayload });
}

async function main() {
  let userId;
  const taskIds = [];
  try {
    userId = await createTestUser();
    const task = await createTask({ taskType: 'social', title: 'Phase 2 verification test', rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: { test: true } });
    taskIds.push(task.id);
    await transitionTaskStatus(task.id, 'pending_review');
    await activateTask(task.id);

    const execution = await executeTask({ taskId: task.id, userId, idempotencyKey: `phase2-exec-${Date.now()}` });
    assert.strictEqual(execution.attempt.status, 'verification_pending');
    assert.strictEqual(execution.gate.required_seconds, 5);

    let verifierCallsBeforeAd = 0;
    await assert.rejects(
      () => finalizeTaskVerification({
        attemptId: execution.attempt.id,
        idempotencyKey: `phase2-before-ad-${Date.now()}`,
        verifyTaskCompletion: async () => {
          verifierCallsBeforeAd += 1;
          return true;
        }
      }),
      /Verification advertisement must be verified first/
    );
    assert.strictEqual(verifierCallsBeforeAd, 0);

    const ad = await startVerificationAd(execution.attempt.id, `phase2-ad-${Date.now()}`, 'phase2-test-ad');
    assert.strictEqual(ad.providerId, 'test-ads');
    await assert.rejects(() => verifyAd(ad.adEvent.id, { accepted: false }), /Advertisement provider verification failed/);
    await verifyAd(ad.adEvent.id, { accepted: true, reference: 'test-provider-ref-1' });

    const rejected = await finalizeTaskVerification({ attemptId: execution.attempt.id, idempotencyKey: `phase2-rejected-${Date.now()}`, verifyTaskCompletion: async () => false });
    assert.strictEqual(rejected.rewarded, false);
    assert.strictEqual(await balance(userId, 'COIN'), 0);

    const execution3 = await executeTask({ taskId: task.id, userId, idempotencyKey: `phase2-exec-3-${Date.now()}` });
    const ad3 = await startVerificationAd(execution3.attempt.id, `phase2-ad-3-${Date.now()}`, 'phase2-test-ad-3');
    await verifyAd(ad3.adEvent.id, { accepted: true, reference: 'test-provider-ref-3' });
    await assert.rejects(
      () => finalizeTaskVerification({ attemptId: execution3.attempt.id, idempotencyKey: `phase2-invalid-verifier-${Date.now()}`, verifyTaskCompletion: async () => ({ verified: true }) }),
      /Task verifier must return a boolean/
    );
    const pending = await pool.query('SELECT status FROM task_attempts WHERE id=$1', [execution3.attempt.id]);
    assert.strictEqual(pending.rows[0].status, 'verification_pending');
    await finalizeTaskVerification({ attemptId: execution3.attempt.id, idempotencyKey: `phase2-rejected-after-contract-${Date.now()}`, verifyTaskCompletion: async () => false });

    const execution2 = await executeTask({ taskId: task.id, userId, idempotencyKey: `phase2-exec-2-${Date.now()}` });
    const ad2 = await startVerificationAd(execution2.attempt.id, `phase2-ad-2-${Date.now()}`, 'phase2-test-ad-2');
    await verifyAd(ad2.adEvent.id, { accepted: true, reference: 'test-provider-ref-2' });

    const verificationKey = `phase2-reward-${Date.now()}`;
    const verified = await finalizeTaskVerification({ attemptId: execution2.attempt.id, idempotencyKey: verificationKey, verifyTaskCompletion: async () => true });
    assert.strictEqual(verified.rewarded, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const duplicate = await finalizeTaskVerification({ attemptId: execution2.attempt.id, idempotencyKey: verificationKey, verifyTaskCompletion: async () => true });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const openLinkTask = await createTask({
      taskType: 'web',
      title: 'Phase 2 open link test',
      rewardCoin: 500,
      rewardDzx: 1,
      rewardDzp: 0,
      verificationAdSeconds: 5,
      config: { completion: { mode: 'open_link', url: 'https://example.test/task' } }
    });
    taskIds.push(openLinkTask.id);
    await transitionTaskStatus(openLinkTask.id, 'pending_review');
    await activateTask(openLinkTask.id);
    const openExecution = await executeTask({ taskId: openLinkTask.id, userId, idempotencyKey: `phase2-open-exec-${Date.now()}` });
    const openAd = await startVerificationAd(openExecution.attempt.id, `phase2-open-ad-${Date.now()}`, 'phase2-open-test-ad');
    await verifyAd(openAd.adEvent.id, { accepted: true, reference: 'test-open-provider-ref' });
    const openVerified = await finalizeTaskVerification({ attemptId: openExecution.attempt.id, idempotencyKey: `phase2-open-reward-${Date.now()}` });
    assert.strictEqual(openVerified.rewarded, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1500);

    const ads = await pool.query(`SELECT context, verified, metadata->>'provider_id' AS provider_id FROM activity_ad_events WHERE user_id=$1 ORDER BY id`, [userId]);
    assert.strictEqual(ads.rows.length, 4);
    assert.strictEqual(ads.rows.filter(row => row.context === 'verification').length, 4);
    assert.strictEqual(ads.rows.filter(row => row.verified && row.provider_id === 'test-ads').length, 4);
    assert.strictEqual(ads.rows.filter(row => !row.verified).length, 0);

    const ledger = await pool.query(`SELECT COUNT(*)::int AS count FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id WHERE lt.user_id=$1 AND le.source='task'`, [userId]);
    assert.strictEqual(ledger.rows[0].count, 4);

    console.log('Phase 2 task verification invariants: PASS');
  } catch (error) {
    console.error('Phase 2 task verification invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (userId) {
      try { await cleanupTestData(userId, taskIds); }
      catch (cleanupError) { console.error('Phase 2 test cleanup: FAIL'); console.error(cleanupError); process.exitCode = 1; }
    }
    await pool.end();
  }
}

main();
