const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { createTask, transitionTaskStatus, activateTask, executeTask } = require('../src/services/task-service');

async function createTestUser() {
  const marker = `active_attempt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [marker, marker, 'Active Attempt Test']
  );
  return result.rows[0].id;
}

async function cleanup(userId, taskId) {
  await withTransaction(async client => {
    await client.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM task_attempts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function main() {
  let userId;
  let taskId;
  try {
    userId = await createTestUser();
    const task = await createTask({
      taskType: 'social',
      title: 'Active attempt idempotency test',
      creatorId: userId,
      target: 1,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5,
      config: { test: true }
    });
    taskId = task.id;
    await transitionTaskStatus(taskId, 'pending_review');
    await activateTask(taskId);

    const first = await executeTask({ taskId, userId, idempotencyKey: `active-attempt-first-${Date.now()}` });
    const second = await executeTask({ taskId, userId, idempotencyKey: `active-attempt-second-${Date.now()}` });

    assert.strictEqual(first.duplicate, false);
    assert.strictEqual(second.duplicate, true);
    assert.strictEqual(second.attempt.id, first.attempt.id);
    assert.strictEqual(second.gate.id, first.gate.id);
    assert.strictEqual(second.attempt.status, 'verification_pending');

    console.log('Task active-attempt idempotency: PASS');
  } catch (error) {
    console.error('Task active-attempt idempotency: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (userId && taskId) {
      try { await cleanup(userId, taskId); }
      catch (cleanupError) { console.error('Task active-attempt cleanup: FAIL'); console.error(cleanupError); process.exitCode = 1; }
    }
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
