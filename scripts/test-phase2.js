const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { createTask, activateTask, executeTask, startVerificationAd, completeVerificationAd, finalizeTaskVerification } = require('../src/services/activity-service');

async function createTestUser() {
  const marker = Date.now();
  const result = await pool.query(
    `INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id`,
    [String(marker), `phase2_${marker}`, 'Phase 2 Test']
  );
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) {
      await client.query(`INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2) ON CONFLICT (user_id,currency) DO NOTHING`, [userId, currency]);
    }
  });
  return userId;
}

async function balance(userId, currency) {
  const result = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2', [userId, currency]);
  return Number(result.rows[0].balance);
}

async function main() {
  let userId;
  let taskId;
  try {
    userId = await createTestUser();
    const task = await createTask({ taskType: 'social', title: 'Phase 2 verification test', rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: { test: true } });
    taskId = task.id;
    await activateTask(taskId);

    const execution = await executeTask({ taskId, userId, idempotencyKey: `phase2-exec-${Date.now()}` });
    assert.strictEqual(execution.attempt.status, 'verification_pending');
    assert.strictEqual(execution.gate.required_seconds, 5);

    await assert.rejects(
      () => finalizeTaskVerification({ attemptId: execution.attempt.id, idempotencyKey: `phase2-verify-before-ad-${Date.now()}`, taskSatisfied: true }),
      /Verification advertisement must be completed first/
    );

    const ad = await startVerificationAd({ attemptId: execution.attempt.id, idempotencyKey: `phase2-ad-${Date.now()}`, externalAdId: 'phase2-test-ad' });
    await completeVerificationAd({ adEventId: ad.adEvent.id });

    const rejected = await finalizeTaskVerification({ attemptId: execution.attempt.id, idempotencyKey: `phase2-rejected-${Date.now()}`, taskSatisfied: false });
    assert.strictEqual(rejected.rewarded, false);
    assert.strictEqual(await balance(userId, 'COIN'), 0);

    const execution2 = await executeTask({ taskId, userId, idempotencyKey: `phase2-exec-2-${Date.now()}` });
    const ad2 = await startVerificationAd({ attemptId: execution2.attempt.id, idempotencyKey: `phase2-ad-2-${Date.now()}`, externalAdId: 'phase2-test-ad-2' });
    await completeVerificationAd({ adEventId: ad2.adEvent.id });

    const verificationKey = `phase2-reward-${Date.now()}`;
    const verified = await finalizeTaskVerification({ attemptId: execution2.attempt.id, idempotencyKey: verificationKey, taskSatisfied: true });
    assert.strictEqual(verified.rewarded, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const duplicate = await finalizeTaskVerification({ attemptId: execution2.attempt.id, idempotencyKey: verificationKey, taskSatisfied: true });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const ads = await pool.query(`SELECT context, verified FROM activity_ad_events WHERE user_id=$1 ORDER BY id`, [userId]);
    assert.ok(ads.rows.length === 2 && ads.rows.every(row => row.context === 'verification' && row.verified));
    const ledger = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id WHERE lt.user_id=$1 AND le.source='task'`,
      [userId]
    );
    assert.strictEqual(ledger.rows[0].count, 3);

    console.log('Phase 2 task verification invariants: PASS');
  } finally {
    if (userId) {
      await withTransaction(async client => {
        await client.query(`DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)`, [userId]);
        await client.query(`DELETE FROM activity_ad_events WHERE user_id=$1`, [userId]);
        await client.query(`DELETE FROM task_attempts WHERE user_id=$1`, [userId]);
        if (taskId) await client.query(`DELETE FROM activity_tasks WHERE id=$1`, [taskId]);
        await client.query(`DELETE FROM users WHERE id=$1`, [userId]);
      });
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Phase 2 task verification invariants: FAIL');
  console.error(error);
  process.exit(1);
});
