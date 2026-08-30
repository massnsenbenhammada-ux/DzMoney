const assert = require('assert');
const { pool } = require('../src/db/pool');
const { executeSystemTask } = require('../src/services/daily-system-task-service');

async function main() {
  const user = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [Date.now() * 1000, `stale_retry_${Date.now()}`, 'Stale Retry Test']
  );
  const userId = user.rows[0].id;
  try {
    const first = await executeSystemTask({
      systemKey: 'daily_check_in',
      userId,
      idempotencyKey: `stale-retry-first-${Date.now()}`
    });
    assert.strictEqual(first.duplicate, false);
    assert.strictEqual(first.attempt.status, 'verification_pending');

    const second = await executeSystemTask({
      systemKey: 'daily_check_in',
      userId,
      idempotencyKey: `stale-retry-second-${Date.now()}`
    });
    assert.strictEqual(second.duplicate, false);
    assert.notStrictEqual(second.attempt.id, first.attempt.id);
    assert.strictEqual(second.attempt.status, 'verification_pending');

    const attempts = await pool.query(
      `SELECT id, status FROM task_attempts WHERE user_id=$1 ORDER BY id`,
      [userId]
    );
    const old = attempts.rows.find(row => String(row.id) === String(first.attempt.id));
    const current = attempts.rows.find(row => String(row.id) === String(second.attempt.id));
    assert.strictEqual(old.status, 'expired');
    assert.strictEqual(current.status, 'verification_pending');
    console.log('Daily Check-in stale-attempt recovery: PASS');
  } finally {
    await pool.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [userId]);
    await pool.query('DELETE FROM task_attempts WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM daily_checkins WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Daily Check-in stale-attempt recovery: FAIL');
  console.error(error);
  process.exit(1);
});
