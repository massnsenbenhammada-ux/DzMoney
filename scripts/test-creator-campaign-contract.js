const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { createTask } = require('../src/services/task-service');

async function createTestUser() {
  const marker = Date.now();
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [String(marker), `creator_contract_${marker}`, 'Creator Contract Test']
  );
  return result.rows[0].id;
}

async function cleanup(userId, taskIds) {
  await withTransaction(async client => {
    if (taskIds.length) {
      await client.query('DELETE FROM activity_tasks WHERE id = ANY($1::bigint[])', [taskIds]);
    }
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function expectReject(input, pattern) {
  await assert.rejects(() => createTask(input), pattern);
}

async function main() {
  let userId;
  const taskIds = [];

  try {
    userId = await createTestUser();

    // Creator campaigns require explicit ownership, a positive target, and a canonical verification contract.
    const campaign = await createTask({
      taskType: 'social',
      title: 'Creator campaign contract',
      creatorId: userId,
      target: 1000,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5,
      config: {
        campaignUrl: 'https://t.me/example_bot?start=campaign',
        verification: { method: 'click_proof' },
        test: true
      }
    });
    taskIds.push(campaign.id);

    assert.strictEqual(String(campaign.creator_id), String(userId));
    assert.strictEqual(Number(campaign.target), 1000);

    // Creator campaign without ownership must be rejected.
    await expectReject({
      taskType: 'social',
      title: 'Missing creator',
      target: 1000,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5
    }, /creatorId is required/);

    // Creator campaign without target must be rejected.
    await expectReject({
      taskType: 'social',
      title: 'Missing target',
      creatorId: userId,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5
    }, /target (?:is required|must be a positive integer)/);

    // Target must be strictly positive.
    await expectReject({
      taskType: 'social',
      title: 'Invalid target',
      creatorId: userId,
      target: 0,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5
    }, /target must be a positive integer/);

    await expectReject({
      taskType: 'social',
      title: 'Fractional target',
      creatorId: userId,
      target: 10.5,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5
    }, /target must be a positive integer/);

    // Daily tasks remain system-owned and must not receive creator campaign fields.
    const daily = await createTask({
      taskType: 'daily',
      title: 'System daily contract',
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5,
      config: { test: true }
    });
    taskIds.push(daily.id);
    assert.strictEqual(daily.creator_id, null);
    assert.strictEqual(daily.target, null);

    console.log('Creator campaign task contract: PASS');
  } catch (error) {
    console.error('Creator campaign task contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (userId) {
      try {
        await cleanup(userId, taskIds);
      } catch (cleanupError) {
        console.error('Creator campaign contract cleanup: FAIL');
        console.error(cleanupError);
        process.exitCode = 1;
      }
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Creator campaign contract runner: FAIL');
  console.error(error);
  process.exit(1);
});
