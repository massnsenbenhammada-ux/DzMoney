const assert = require('node:assert/strict');
const { pool } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const {
  createCreatorCampaign,
  submitCreatorCampaignForReview,
  approveCreatorCampaign,
  rejectCreatorCampaign
} = require('../src/services/task-service');

async function main() {
  let creator;
  let taskId;
  const marker = `campaign-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    creator = await createUser({ telegramUserId: -Date.now(), username: marker, firstName: 'Campaign Review Test' });
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, ['task.campaign_price_dzx_per_execution', '9']);
    await postEconomyTransaction({
      idempotencyKey: `${marker}:funding`,
      userId: creator.id,
      type: 'TEST_CREDIT',
      metadata: { source: 'creator_campaign_review_test' },
      movements: [{ currency: 'DZX', amount: 100, source: 'test' }]
    });

    const campaign = await createCreatorCampaign({
      taskType: 'social', title: 'Review lifecycle contract', creatorId: creator.id, target: 10,
      idempotencyKey: `${marker}:campaign`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1,
      verificationAdSeconds: 5, config: { test: true }
    });
    taskId = campaign.task.id;
    assert.equal(campaign.task.status, 'draft');

    await assert.rejects(() => approveCreatorCampaign(taskId), /pending_review/);
    const pending = await submitCreatorCampaignForReview(taskId, creator.id);
    assert.equal(pending.status, 'pending_review');

    const active = await approveCreatorCampaign(taskId);
    assert.equal(active.status, 'active');

    const second = await createCreatorCampaign({
      taskType: 'social', title: 'Rejected campaign', creatorId: creator.id, target: 1,
      idempotencyKey: `${marker}:rejected`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1,
      verificationAdSeconds: 5, config: { test: true }
    });
    const rejectedId = second.task.id;
    try {
      await assert.rejects(() => rejectCreatorCampaign(rejectedId, creator.id), /pending_review/);
      await submitCreatorCampaignForReview(rejectedId, creator.id);
      const rejected = await rejectCreatorCampaign(rejectedId, creator.id);
      assert.equal(rejected.status, 'refunded');
    } finally {
      await pool.query('DELETE FROM activity_tasks WHERE id=$1', [rejectedId]);
    }

    console.log('Creator campaign review lifecycle contract: PASS');
  } catch (error) {
    console.error('Creator campaign review lifecycle contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (taskId) await pool.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    if (creator) {
      await pool.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [creator.id]);
      await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [creator.id]);
      await pool.query('DELETE FROM users WHERE id=$1', [creator.id]);
    }
    await pool.query('DELETE FROM admin_settings WHERE key=$1', ['task.campaign_price_dzx_per_execution']);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
