const assert = require('assert');
const crypto = require('crypto');
const { pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { executeSystemTask } = require('../src/services/daily-system-task-service');
const { finalizeTaskVerification } = require('../src/services/task-verification-service');

const SYSTEM_KEY = 'invite_1_friend';

async function createTestUser(prefix) {
  const telegramUserId = (BigInt(Date.now()) * 1000000n + BigInt(crypto.randomInt(0, 1000000))).toString();
  return walletService.createUser({
    telegramUserId,
    username: `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    firstName: `Invite ${prefix}`
  });
}

async function walletBalances(userId) {
  const result = await pool.query(
    `SELECT currency, balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency`,
    [userId]
  );
  return Object.fromEntries(result.rows.map(row => [row.currency, Number(row.balance)]));
}

async function main() {
  const referrer = await createTestUser('invite_referrer');
  const referred = await createTestUser('invite_referred');
  const userId = referrer.id;

  try {
    await pool.query(
      `INSERT INTO referral_attributions(
         referrer_user_id, referred_user_id, status,
         qualified_at, qualification_source, qualification_reference_id
       ) VALUES ($1,$2,'qualified',NOW(),'advertisement',$3)`,
      [referrer.id, referred.id, Date.now()]
    );

    const task = await pool.query(
      `SELECT id, reward_coin, reward_dzx, reward_dzp
       FROM activity_tasks
       WHERE task_type='daily' AND config->>'systemKey'=$1 AND status='active'
       LIMIT 1`,
      [SYSTEM_KEY]
    );
    assert.strictEqual(task.rowCount, 1, 'Invite 1 task must be active');
    const expected = {
      COIN: Number(task.rows[0].reward_coin),
      DZX: Number(task.rows[0].reward_dzx),
      DZP: Number(task.rows[0].reward_dzp)
    };

    await assert.rejects(
      executeSystemTask({
        systemKey: 'invite_10_friends',
        userId,
        idempotencyKey: `invite-negative-${crypto.randomUUID()}`
      }),
      /Referral achievement is not claimable/
    );

    const before = await walletBalances(userId);
    const execution = await executeSystemTask({
      systemKey: SYSTEM_KEY,
      userId,
      idempotencyKey: `invite-execute-${crypto.randomUUID()}`
    });
    const attemptId = execution.attempt.id;
    assert.strictEqual(execution.duplicate, false);
    assert.strictEqual(execution.attempt.status, 'verification_pending');
    assert.strictEqual(execution.gate.status, 'pending');

    await assert.rejects(
      finalizeTaskVerification({ attemptId, idempotencyKey: `invite-failed-${crypto.randomUUID()}` }),
      /Verification advertisement must be verified first/
    );
    assert.deepStrictEqual(await walletBalances(userId), before);

    await pool.query(
      `UPDATE task_verification_gates
       SET status='ad_completed', ad_completed_at=NOW()
       WHERE id=$1`,
      [execution.gate.id]
    );

    const idempotencyKey = `invite-finalize-${crypto.randomUUID()}`;
    const results = await Promise.all([
      finalizeTaskVerification({ attemptId, idempotencyKey }),
      finalizeTaskVerification({ attemptId, idempotencyKey: `${idempotencyKey}-concurrent` })
    ]);
    const rewarded = results.filter(result => result.status === 'verified' && result.rewarded === true && result.duplicate !== true);
    const duplicates = results.filter(result => result.duplicate === true);
    assert.strictEqual(rewarded.length, 1, 'Concurrent Invite claims must produce one reward');
    assert.strictEqual(duplicates.length, 1, 'Concurrent duplicate Invite claim must be rejected as duplicate');
    assert.deepStrictEqual(rewarded[0].reward, {
      coin: expected.COIN,
      dzx: expected.DZX,
      dzp: expected.DZP
    });

    const after = await walletBalances(userId);
    assert.strictEqual(after.COIN - before.COIN, expected.COIN);
    assert.strictEqual(after.DZX - before.DZX, expected.DZX);
    assert.strictEqual(after.DZP - before.DZP, expected.DZP);

    const transactions = await pool.query(
      `SELECT id, transaction_type, metadata
       FROM ledger_transactions
       WHERE user_id=$1 AND metadata->>'source'='task'
       ORDER BY id`,
      [userId]
    );
    assert.strictEqual(transactions.rowCount, 1, 'Invite claim must create exactly one task reward transaction');
    assert.strictEqual(transactions.rows[0].transaction_type, 'REWARD');

    const duplicate = await finalizeTaskVerification({
      attemptId,
      idempotencyKey: `${idempotencyKey}-retry`
    });
    assert.strictEqual(duplicate.status, 'verified');
    assert.strictEqual(duplicate.duplicate, true);
    assert.deepStrictEqual(await walletBalances(userId), after);

    console.log('Invite achievement claim integration: PASS');
  } finally {
    await pool.query('DELETE FROM referral_attributions WHERE referrer_user_id=$1 OR referred_user_id=$1', [userId]);
    await pool.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [userId]);
    await pool.query('DELETE FROM task_attempts WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
    await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [userId, referred.id]);
  }
}

main().catch(error => {
  console.error('Invite achievement claim integration: FAIL');
  console.error(error);
  process.exit(1);
});
