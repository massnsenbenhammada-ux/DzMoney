const assert = require('node:assert/strict');
const { pool } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const { createCreatorCampaign, submitCreatorCampaignForReview, approveCreatorCampaign, rejectCreatorCampaign } = require('../src/services/task-service');

async function main() {
  let creator;
  let taskId;
  const marker = `campaign-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const creatorConfig = {
    campaignUrl: 'https://t.me/example_bot?start=campaign',
    verification: { method: 'click_proof' },
    test: true
  };
  try {
    creator = await createUser({ telegramUserId: -Date.now(), username: marker, firstName: 'Campaign Review Test' });
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, ['task.campaign_price_dzx_per_execution', '9']);
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, ['task.campaign_rejection_tax_percent', '10']);
    await postEconomyTransaction({ idempotencyKey: `${marker}:funding`, userId: creator.id, type: 'TEST_CREDIT', metadata: { source: 'creator_campaign_review_test' }, movements: [{ currency: 'DZX', amount: 200, source: 'test' }] });

    const campaign = await createCreatorCampaign({ taskType: 'social', title: 'Review lifecycle contract', creatorId: creator.id, target: 10, idempotencyKey: `${marker}:campaign`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: creatorConfig });
    taskId = campaign.task.id;
    assert.equal(campaign.task.status, 'draft');

    await assert.rejects(() => approveCreatorCampaign(taskId), /cannot transition from draft to active|pending_review/i);
    const pending = await submitCreatorCampaignForReview(taskId, creator.id);
    assert.equal(pending.status, 'pending_review');
    const active = await approveCreatorCampaign(taskId);
    assert.equal(active.status, 'active');

    const second = await createCreatorCampaign({ taskType: 'social', title: 'Rejected campaign', creatorId: creator.id, target: 1, idempotencyKey: `${marker}:rejected`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: creatorConfig });
    try {
      await assert.rejects(() => rejectCreatorCampaign(second.task.id, creator.id), /pending_review/);
      await submitCreatorCampaignForReview(second.task.id, creator.id);
      const rejected = await rejectCreatorCampaign(second.task.id, creator.id);
      assert.equal(rejected.task.status, 'refunded');
      assert.equal(Number(rejected.taxPercent), 10);
      assert.equal(Number(rejected.refundDZX), 8.1);
      const duplicate = await rejectCreatorCampaign(second.task.id, creator.id);
      assert.equal(duplicate.duplicate, true);
    } finally {
      await pool.query('DELETE FROM activity_tasks WHERE id=$1', [second.task.id]);
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
    await pool.query('DELETE FROM admin_settings WHERE key IN ($1,$2)', ['task.campaign_price_dzx_per_execution', 'task.campaign_rejection_tax_percent']);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });