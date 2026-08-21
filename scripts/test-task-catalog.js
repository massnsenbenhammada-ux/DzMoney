const assert = require('assert');
const { pool } = require('../src/db/pool');
const { createTask, activateTask, listActiveTasks } = require('../src/services/task-service');

async function cleanup(taskIds) {
  await pool.query('DELETE FROM activity_tasks WHERE id = ANY($1::bigint[])', [taskIds]);
}

async function main() {
  const taskIds = [];
  try {
    const daily = await createTask({
      taskType: 'daily',
      title: 'Daily catalog test',
      description: 'Catalog entry',
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5
    });
    const social = await createTask({
      taskType: 'social',
      title: 'Social draft must stay hidden',
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
    assert.deepStrictEqual(filtered.map(task => task.id), [daily.id]);
    assert.strictEqual(filtered[0].verificationAdSeconds, 5);
    assert.strictEqual(filtered[0].rewardCoin, 1000);
    assert.strictEqual(filtered[0].rewardDzx, 1);
    assert.strictEqual(filtered[0].rewardDzp, 1);

    console.log('Task catalog foundation invariants: PASS');
  } catch (error) {
    console.error('Task catalog foundation invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup(taskIds);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Task catalog test runner: FAIL');
  console.error(error);
  process.exit(1);
});
