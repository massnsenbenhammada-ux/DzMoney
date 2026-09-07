const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { executeTask } = require('../src/services/task-service');
const { finalizeTaskVerification } = require('../src/services/task-verification-service');

async function main() {
  const marker = `creator-target-${crypto.randomUUID()}`;
  const users = [];
  let taskId;

  try {
    for (let index = 0; index < 3; index += 1) {
      users.push(await createUser({
        telegramUserId: -(Date.now() * 10 + index),
        username: `${marker}-${index}`,
        firstName: `Creator Target ${index}`
      }));
    }

    const taskResult = await pool.query(
      `INSERT INTO activity_tasks
       (task_type,title,creator_id,target,reward_coin,reward_dzx,reward_dzp,verification_ad_seconds,status,config)
       VALUES ('social',$1,$2,2,1000,1,1,5,'active',$3)
       RETURNING id`,
      [marker, users[0].id, JSON.stringify({ campaignUrl: 'https://t.me/example', verification: { method: 'click_proof' } })]
    );
    taskId = taskResult.rows[0].id;

    const attempts = [];
    for (const user of users) {
      const execution = await executeTask({
        taskId,
        userId: user.id,
        idempotencyKey: `${marker}:execute:${user.id}`,
        metadata: {}
      });
      attempts.push(execution.attempt);
      await pool.query(
        `UPDATE task_verification_gates SET status='ad_completed',ad_completed_at=NOW() WHERE attempt_id=$1`,
        [execution.attempt.id]
      );
    }

    const first = await finalizeTaskVerification({
      attemptId: attempts[0].id,
      idempotencyKey: `${marker}:verify:${users[0].id}`,
      verifyTaskCompletion: async () => true
    });
    assert.equal(first.status, 'verified');
    assert.equal((await pool.query('SELECT status FROM activity_tasks WHERE id=$1', [taskId])).rows[0].status, 'active');

    const remaining = await Promise.all([
      finalizeTaskVerification({
        attemptId: attempts[1].id,
        idempotencyKey: `${marker}:verify:${users[1].id}`,
        verifyTaskCompletion: async () => true
      }),
      finalizeTaskVerification({
        attemptId: attempts[2].id,
        idempotencyKey: `${marker}:verify:${users[2].id}`,
        verifyTaskCompletion: async () => true
      })
    ]);

    assert.equal(remaining.filter(result => result.status === 'verified').length, 1);
    assert.equal(remaining.filter(result => result.status === 'rejected').length, 1);

    const task = await pool.query('SELECT status,target FROM activity_tasks WHERE id=$1', [taskId]);
    assert.equal(task.rows[0].status, 'completed');
    assert.equal(Number(task.rows[0].target), 2);

    const verified = await pool.query(
      `SELECT COUNT(*)::int AS count FROM task_attempts WHERE task_id=$1 AND status='verified'`,
      [taskId]
    );
    assert.equal(Number(verified.rows[0].count), 2);

    const rejected = await pool.query(
      `SELECT COUNT(*)::int AS count FROM task_attempts WHERE task_id=$1 AND status='rejected'`,
      [taskId]
    );
    assert.equal(Number(rejected.rows[0].count), 1);

    await assert.rejects(
      () => executeTask({
        taskId,
        userId: users[0].id,
        idempotencyKey: `${marker}:post-target`,
        metadata: {}
      }),
      /not active/i
    );

    console.log('Creator campaign target enforcement: PASS');
  } catch (error) {
    console.error('Creator campaign target enforcement: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (taskId) {
      await pool.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    }
    if (users.length) {
      await withTransaction(async client => {
        const ids = users.map(user => user.id);
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[]))', [ids]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
      });
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Creator campaign target enforcement runner: FAIL');
  console.error(error);
  process.exit(1);
});
