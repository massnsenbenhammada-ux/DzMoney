const assert = require('assert');
const crypto = require('crypto');
const { pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { executeSystemTask } = require('../src/services/daily-system-task-service');
const { finalizeTaskVerification } = require('../src/services/task-verification-service');

const SYSTEM_KEY = 'check_for_update';
const CHANNEL = '@DzMoneyChecking';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real Telegram integration test`);
  return value;
}

async function createTestUser(telegramUserId) {
  return walletService.createUser({
    telegramUserId,
    username: `telegram_real_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    firstName: 'Real Telegram Check Update'
  });
}

async function walletBalances(userId) {
  const result = await pool.query(
    'SELECT currency, balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency',
    [userId]
  );
  return Object.fromEntries(result.rows.map(row => [row.currency, Number(row.balance)]));
}

async function main() {
  requireEnv('BOT_TOKEN');
  const telegramUserId = requireEnv('TEST_TELEGRAM_USER_ID');
  const user = await createTestUser(telegramUserId);

  try {
    const taskResult = await pool.query(
      `SELECT id, reward_coin, reward_dzx, reward_dzp, config
       FROM activity_tasks
       WHERE task_type='daily' AND config->>'systemKey'=$1 AND status='active'
       LIMIT 1`,
      [SYSTEM_KEY]
    );
    assert.strictEqual(taskResult.rowCount, 1, 'Check for Update task must be active');
    const task = taskResult.rows[0];
    assert.strictEqual(task.config.dailyPolicy, 'utc_plus_one_calendar_day');
    assert.strictEqual(task.config.verification.provider, 'telegram_channel');
    assert.strictEqual(task.config.verification.providerConfigRef, 'telegram.dzmoney_updates');

    const expected = {
      COIN: Number(task.reward_coin),
      DZX: Number(task.reward_dzx),
      DZP: Number(task.reward_dzp)
    };
    assert(expected.COIN > 0 || expected.DZX > 0 || expected.DZP > 0, 'Check for Update must have a reward');

    const before = await walletBalances(user.id);
    const execution = await executeSystemTask({
      systemKey: SYSTEM_KEY,
      userId: user.id,
      idempotencyKey: `check-update-real-${crypto.randomUUID()}`
    });
    assert.strictEqual(execution.attempt.status, 'verification_pending');
    assert.strictEqual(execution.gate.status, 'pending');
    assert.strictEqual(execution.gate.ad_event_id, null);

    const concurrentKey = `check-update-real-finalize-${crypto.randomUUID()}`;
    const results = await Promise.all([
      finalizeTaskVerification({
        attemptId: execution.attempt.id,
        idempotencyKey: concurrentKey
      }),
      finalizeTaskVerification({
        attemptId: execution.attempt.id,
        idempotencyKey: `${concurrentKey}-concurrent`
      })
    ]);

    const rewarded = results.filter(result => result.status === 'verified' && result.rewarded === true && result.duplicate !== true);
    const duplicates = results.filter(result => result.duplicate === true);
    assert.strictEqual(rewarded.length, 1, 'Concurrent real Telegram claims must create one reward');
    assert.strictEqual(duplicates.length, 1, 'Concurrent real Telegram claim must produce one duplicate result');
    assert.deepStrictEqual(rewarded[0].reward, {
      coin: expected.COIN,
      dzx: expected.DZX,
      dzp: expected.DZP
    });

    const after = await walletBalances(user.id);
    assert.strictEqual(after.COIN - before.COIN, expected.COIN);
    assert.strictEqual(after.DZX - before.DZX, expected.DZX);
    assert.strictEqual(after.DZP - before.DZP, expected.DZP);

    const transactions = await pool.query(
      `SELECT transaction_type, metadata
       FROM ledger_transactions
       WHERE user_id=$1 AND metadata->>'source'='task'`,
      [user.id]
    );
    assert.strictEqual(transactions.rowCount, 1);
    assert.strictEqual(transactions.rows[0].transaction_type, 'REWARD');
    assert.strictEqual(transactions.rows[0].metadata.activity_type, 'daily');
    assert.strictEqual(transactions.rows[0].metadata.activity_context, 'task');

    const adEvents = await pool.query(
      'SELECT id FROM activity_ad_events WHERE user_id=$1',
      [user.id]
    );
    assert.strictEqual(adEvents.rowCount, 0, 'Check for Update must not create an advertisement event');

    const retry = await finalizeTaskVerification({
      attemptId: execution.attempt.id,
      idempotencyKey: `check-update-real-retry-${crypto.randomUUID()}`
    });
    assert.strictEqual(retry.status, 'verified');
    assert.strictEqual(retry.duplicate, true);
    assert.deepStrictEqual(await walletBalances(user.id), after);

    await assert.rejects(
      executeSystemTask({
        systemKey: SYSTEM_KEY,
        userId: user.id,
        idempotencyKey: `check-update-real-same-day-${crypto.randomUUID()}`
      }),
      /already completed for the current eligibility window/
    );

    console.log(`Real Telegram Check for Update: PASS (${CHANNEL}, user ${telegramUserId})`);
  } finally {
    await pool.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [user.id]);
    await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [user.id]);
    await pool.query('DELETE FROM task_attempts WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
  }
}

main().catch(error => {
  console.error('Real Telegram Check for Update: FAIL');
  console.error(error);
  process.exit(1);
});
