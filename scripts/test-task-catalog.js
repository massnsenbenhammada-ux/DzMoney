const assert = require('assert');
const { pool } = require('../src/db/pool');
const {
  createTask,
  transitionTaskStatus,
  listActiveTasks
} = require('../src/services/task-service');

async function createTestUser() {
  const marker = Date.now();
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [String(marker), `task_catalog_${marker}`, 'Task Catalog Test']
  );
  return result.rows[0].id;
}

async function cleanup(taskIds, userId) {
  await pool.query('DELETE FROM activity_tasks WHERE id = ANY($1::bigint[])', [taskIds]);
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]);
}

async function activateTask(taskId) {
  await transitionTaskStatus(taskId, 'pending_review');
  await transitionTaskStatus(taskId, 'active');
}

async function main() {
  const taskIds = [];
  let userId;
  try {
    userId = await createTestUser();

    await assert.rejects(
      () => createTask({
        taskType: 'special',
        title: 'Invalid Special legacy task',
        rewardCoin: 1000,
        rewardDzx: 1,
        rewardDzp: 1,
        config: { completion: { mode: 'server_verified' } }
      }),
      /Legacy completion configuration is not supported/
    );

    const daily = await createTask({
      taskType: 'daily',
      title: 'Daily catalog test',
      description: 'Catalog entry',
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5,
      config: {
        verification: { method: 'click_proof' }
      }
    });
    const social = await createTask({
      taskType: 'social',
      title: 'Social draft must stay hidden',
      creatorId: userId,
      target: 1000,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 10
    });
    taskIds.push(daily.id, social.id);
    await activateTask(daily.id);

    const all = await listActiveTasks();
    assert.ok(all.some(task => task.id === daily.id));
    assert.ok(!all.some(task => task.id === social.id));

    const filtered = await listActiveTasks({ taskType: 'daily' });
    const createdDaily = filtered.find(task => task.id === daily.id);
    assert.ok(createdDaily);
    assert.strictEqual(createdDaily.verificationAdSeconds, 5);
    assert.strictEqual(createdDaily.rewardCoin, 1000);
    assert.strictEqual(createdDaily.rewardDzx, 1);
    assert.strictEqual(createdDaily.rewardDzp, 1);
    assert.deepStrictEqual(createdDaily.verification, {
      method: 'click_proof'
    });

    console.log('Task catalog foundation invariants: PASS');
  } catch (error) {
    console.error('Task catalog foundation invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup(taskIds, userId);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Task catalog test runner: FAIL');
  process.exit(1);
});