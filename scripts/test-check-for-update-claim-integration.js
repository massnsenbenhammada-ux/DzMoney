const assert = require('assert');
const crypto = require('crypto');
const { pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const {
  executeSystemTask,
} = require('../src/services/daily-system-task-service');
const {
  finalizeTaskVerification,
  resolveTrustedTaskVerifier,
} = require('../src/services/task-verification-service');

const SYSTEM_KEY = 'check_for_update';
const CHANNEL = '@DzMoneyChecking';

async function createTestUser(prefix) {
  const telegramUserId = (
    BigInt(Date.now()) * 1000000n +
    BigInt(crypto.randomInt(0, 1000000))
  ).toString();
  return walletService.createUser({
    telegramUserId,
    username: `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    firstName: `Check Update ${prefix}`,
  });
}

async function walletBalances(userId) {
  const result = await pool.query(
    `SELECT currency, balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency`,
    [userId],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.currency, Number(row.balance)]),
  );
}

function telegramMembershipVerifier({
  botToken,
  expectedTelegramUserId,
  member,
}) {
  let calls = 0;
  const verifier = resolveTrustedTaskVerifier({
    config: {
      verification: {
        provider: 'telegram_channel',
        method: 'bot_api',
        event: 'channel_membership',
        providerConfigRef: 'telegram.dzmoney_updates',
      },
    },
    telegramUserId: expectedTelegramUserId,
    botToken,
    verifyMembership: async (args) => {
      calls += 1;
      assert.strictEqual(args.botToken, botToken);
      assert.strictEqual(args.channel, CHANNEL);
      assert.strictEqual(String(args.userId), String(expectedTelegramUserId));
      return member;
    },
  });
  return { verifier, getCalls: () => calls };
}

async function main() {
  const user = await createTestUser('claim');
  try {
    const taskResult = await pool.query(
      `SELECT id, reward_coin, reward_dzx, reward_dzp, config
       FROM activity_tasks
       WHERE task_type='daily' AND config->>'systemKey'=$1 AND status='active'
       LIMIT 1`,
      [SYSTEM_KEY],
    );
    assert.strictEqual(
      taskResult.rowCount,
      1,
      'Check for Update task must be active',
    );
    const task = taskResult.rows[0];
    assert.strictEqual(task.config.dailyPolicy, 'utc_plus_one_calendar_day');
    assert.strictEqual(task.config.verification.provider, 'telegram_channel');
    assert.strictEqual(
      task.config.verification.providerConfigRef,
      'telegram.dzmoney_updates',
    );
    const expected = {
      COIN: Number(task.reward_coin),
      DZX: Number(task.reward_dzx),
      DZP: Number(task.reward_dzp),
    };
    assert(
      expected.COIN > 0 || expected.DZX > 0 || expected.DZP > 0,
      'Check for Update must have a reward',
    );

    const before = await walletBalances(user.id);

    const failedExecution = await executeSystemTask({
      systemKey: SYSTEM_KEY,
      userId: user.id,
      idempotencyKey: `check-update-negative-${crypto.randomUUID()}`,
    });
    assert.strictEqual(failedExecution.attempt.status, 'verification_pending');
    assert.strictEqual(failedExecution.gate.status, 'pending');
    assert.strictEqual(failedExecution.gate.ad_event_id, null);

    const rejectedTelegram = telegramMembershipVerifier({
      botToken: 'test-bot-token',
      expectedTelegramUserId: user.telegram_user_id,
      member: false,
    });
    const rejected = await finalizeTaskVerification({
      attemptId: failedExecution.attempt.id,
      idempotencyKey: `check-update-negative-finalize-${crypto.randomUUID()}`,
      verifyTaskCompletion: rejectedTelegram.verifier,
    });
    assert.deepStrictEqual(rejected, {
      duplicate: false,
      status: 'rejected',
      rewarded: false,
    });
    assert(
      rejectedTelegram.getCalls() >= 1,
      'Telegram membership verifier must be called',
    );
    assert.deepStrictEqual(
      await walletBalances(user.id),
      before,
      'Non-member must receive no reward',
    );

    const execution = await executeSystemTask({
      systemKey: SYSTEM_KEY,
      userId: user.id,
      idempotencyKey: `check-update-success-${crypto.randomUUID()}`,
    });
    assert.strictEqual(execution.attempt.status, 'verification_pending');
    assert.strictEqual(execution.gate.status, 'pending');
    assert.strictEqual(
      execution.gate.ad_event_id,
      null,
      'Check for Update must not create an ad event',
    );

    const acceptedTelegram = telegramMembershipVerifier({
      botToken: 'test-bot-token',
      expectedTelegramUserId: user.telegram_user_id,
      member: true,
    });
    const concurrentKey = `check-update-finalize-${crypto.randomUUID()}`;
    const results = await Promise.all([
      finalizeTaskVerification({
        attemptId: execution.attempt.id,
        idempotencyKey: concurrentKey,
        verifyTaskCompletion: acceptedTelegram.verifier,
      }),
      finalizeTaskVerification({
        attemptId: execution.attempt.id,
        idempotencyKey: `${concurrentKey}-concurrent`,
        verifyTaskCompletion: acceptedTelegram.verifier,
      }),
    ]);
    const rewarded = results.filter(
      (result) =>
        result.status === 'verified' &&
        result.rewarded === true &&
        result.duplicate !== true,
    );
    const duplicates = results.filter((result) => result.duplicate === true);
    assert.strictEqual(
      rewarded.length,
      1,
      'Concurrent Check for Update claims must create one reward',
    );
    assert.strictEqual(
      duplicates.length,
      1,
      'Concurrent Check for Update claim must produce one duplicate result',
    );
    assert.deepStrictEqual(rewarded[0].reward, {
      coin: expected.COIN,
      dzx: expected.DZX,
      dzp: expected.DZP,
    });
    assert(
      acceptedTelegram.getCalls() >= 1,
      'Accepted claim must use Telegram membership verifier',
    );

    const after = await walletBalances(user.id);
    assert.strictEqual(after.COIN - before.COIN, expected.COIN);
    assert.strictEqual(after.DZX - before.DZX, expected.DZX);
    assert.strictEqual(after.DZP - before.DZP, expected.DZP);

    const transactions = await pool.query(
      `SELECT id, transaction_type, metadata
       FROM ledger_transactions
       WHERE user_id=$1 AND metadata->>'source'='task'
       ORDER BY id`,
      [user.id],
    );
    assert.strictEqual(
      transactions.rowCount,
      1,
      'Check for Update must create exactly one task reward transaction',
    );
    assert.strictEqual(transactions.rows[0].transaction_type, 'REWARD');
    assert.strictEqual(transactions.rows[0].metadata.activity_type, 'daily');
    assert.strictEqual(transactions.rows[0].metadata.activity_context, 'task');

    const adEvents = await pool.query(
      'SELECT id FROM activity_ad_events WHERE user_id=$1',
      [user.id],
    );
    assert.strictEqual(
      adEvents.rowCount,
      0,
      'Check for Update must not create advertisement events',
    );

    const retry = await finalizeTaskVerification({
      attemptId: execution.attempt.id,
      idempotencyKey: `check-update-retry-${crypto.randomUUID()}`,
      verifyTaskCompletion: acceptedTelegram.verifier,
    });
    assert.strictEqual(retry.status, 'verified');
    assert.strictEqual(retry.duplicate, true);
    assert.deepStrictEqual(
      await walletBalances(user.id),
      after,
      'Retry must not grant a second reward',
    );

    await assert.rejects(
      executeSystemTask({
        systemKey: SYSTEM_KEY,
        userId: user.id,
        idempotencyKey: `check-update-same-day-${crypto.randomUUID()}`,
      }),
      /already completed for the current eligibility window/,
    );

    await pool.query(
      `UPDATE task_attempts
       SET verified_at = (NOW() + INTERVAL '1 hour')::date - INTERVAL '1 day' + INTERVAL '12 hours'
       WHERE id=$1`,
      [execution.attempt.id],
    );
    const nextDayExecution = await executeSystemTask({
      systemKey: SYSTEM_KEY,
      userId: user.id,
      idempotencyKey: `check-update-next-day-${crypto.randomUUID()}`,
    });
    assert.strictEqual(nextDayExecution.attempt.status, 'verification_pending');
    assert.strictEqual(nextDayExecution.gate.ad_event_id, null);

    console.log('Check for Update claim integration: PASS');
  } finally {
    await pool.query(
      'DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)',
      [user.id],
    );
    await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [
      user.id,
    ]);
    await pool.query(
      'DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)',
      [user.id],
    );
    await pool.query('DELETE FROM task_attempts WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [
      user.id,
    ]);
    await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
  }
}

main().catch((error) => {
  console.error('Check for Update claim integration: FAIL');
  console.error(error);
  process.exit(1);
});
