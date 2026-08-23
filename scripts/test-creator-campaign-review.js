const assert = require('node:assert/strict');
const { pool } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { createCreatorCampaign, transitionTaskStatus } = require('../src/services/task-service');

async function main() {
  let user;
  let taskId;
  const marker = `campaign-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    user = await createUser({ telegramUserId: -Date.now(), username: marker, firstName: 'Campaign Review Test' });
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, ['task.campaign_price_dzx_per_execution', '9']);
    const campaign = await createCreatorCampaign({
      taskType: 'social', title: 'Review lifecycle contract', creatorId: user.id, target: 10,
      idempotencyKey: `${marker}:campaign`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1,
      verificationAdSeconds: 5, config: { test: true }
    });
    taskId = campaign.task.id;
    assert.equal(campaign.task.status, 'draft');
    await assert.rejects(() => transitionTaskStatus(taskId, 'active'), /cannot transition from draft to active/);
    const pending = await transitionTaskStatus(taskId, 'pending_review');
    assert.equal(pending.status, 'pending_review');
    const active = await transitionTaskStatus(taskId, 'active');
    assert.equal(active.status, 'active');
    await assert.rejects(() => transitionTaskStatus(taskId, 'refunded'), /cannot transition from active to refunded/);
    console.log('Creator campaign review lifecycle contract: PASS');
  } catch (error) {
    console.error('Creator campaign review lifecycle contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (taskId) await pool.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    if (user) await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
    await pool.query('DELETE FROM admin_settings WHERE key=$1', ['task.campaign_price_dzx_per_execution']);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
