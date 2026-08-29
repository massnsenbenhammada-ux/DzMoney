const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const { createCreatorCampaign, submitCreatorCampaignForReview, rejectCreatorCampaign } = require('../src/services/task-service');

const PRICE_KEY = 'task.campaign_price_dzx_per_execution';
const TAX_KEY = 'task.campaign_rejection_tax_percent';

async function main() {
  let user;
  let taskId;
  const marker = `campaign-tax-refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const creatorConfig = {
    campaignUrl: 'https://t.me/example_bot?start=campaign',
    verification: { method: 'click_proof' },
    test: true
  };
  try {
    user = await createUser({ telegramUserId: -Date.now(), username: marker, firstName: 'Campaign Tax Refund Test' });
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, [PRICE_KEY, '9']);
    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, [TAX_KEY, '10']);
    await postEconomyTransaction({ idempotencyKey: `${marker}:fund`, userId: user.id, type: 'TEST_CREDIT', metadata: { source: 'test' }, movements: [{ currency: 'DZX', amount: 100, source: 'test' }] });

    const campaign = await createCreatorCampaign({ taskType: 'social', title: 'Tax refund contract', creatorId: user.id, target: 10, idempotencyKey: `${marker}:campaign`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: creatorConfig });
    taskId = campaign.task.id;
    assert.equal(Number(campaign.campaignCostDZX), 90);
    const pending = await submitCreatorCampaignForReview(taskId, user.id);
    assert.equal(pending.status, 'pending_review');

    const rejected = await rejectCreatorCampaign(taskId, user.id);
    assert.equal(rejected.task.status, 'refunded');
    assert.equal(Number(rejected.campaignCostDZX), 90);
    assert.equal(Number(rejected.taxPercent), 10);
    assert.equal(Number(rejected.taxDZX), 9);
    assert.equal(Number(rejected.refundDZX), 81);

    const wallet = await pool.query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [user.id]);
    assert.equal(Number(wallet.rows[0].balance), 91);

    const ledger = await pool.query(
      `SELECT lt.transaction_type, lt.metadata, le.amount, le.source FROM ledger_entries le JOIN ledger_transactions lt ON lt.id=le.transaction_id WHERE lt.user_id=$1 AND le.source IN ('creator_campaign','creator_campaign_refund') ORDER BY le.id`,
      [user.id]
    );
    const debit = ledger.rows.find(row => row.source === 'creator_campaign' && Number(row.amount) === -90);
    const refund = ledger.rows.find(row => row.source === 'creator_campaign_refund');
    assert.ok(debit);
    assert.ok(refund);
    assert.equal(Number(refund.amount), 81);
    assert.equal(Number(refund.metadata.tax_percent), 10);
    assert.equal(Number(refund.metadata.tax_dzx), 9);
    assert.equal(Number(refund.metadata.refund_dzx), 81);
    assert.equal(Number(refund.metadata.campaign_cost_dzx), 90);

    const duplicate = await rejectCreatorCampaign(taskId, user.id);
    assert.equal(duplicate.duplicate, true);
    const walletAfterDuplicate = await pool.query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [user.id]);
    assert.equal(Number(walletAfterDuplicate.rows[0].balance), 91);

    await pool.query(`INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, [TAX_KEY, '100']);
    const fullTaxCampaign = await createCreatorCampaign({ taskType: 'social', title: 'Full tax contract', creatorId: user.id, target: 1, idempotencyKey: `${marker}:full-tax-campaign`, rewardCoin: 1000, rewardDzx: 1, rewardDzp: 1, verificationAdSeconds: 5, config: creatorConfig });
    const fullTaxTaskId = fullTaxCampaign.task.id;
    await submitCreatorCampaignForReview(fullTaxTaskId, user.id);
    const fullTaxRejected = await rejectCreatorCampaign(fullTaxTaskId, user.id);
    assert.equal(Number(fullTaxRejected.taxPercent), 100);
    assert.equal(Number(fullTaxRejected.taxDZX), 9);
    assert.equal(Number(fullTaxRejected.refundDZX), 0);
    assert.equal(fullTaxRejected.task.status, 'refunded');
    const fullTaxTx = await pool.query(`SELECT metadata FROM ledger_transactions WHERE idempotency_key=$1`, [`creator-campaign-rejection:${fullTaxTaskId}`]);
    assert.equal(fullTaxTx.rowCount, 1);
    assert.equal(Number(fullTaxTx.rows[0].metadata.tax_percent), 100);
    assert.equal(Number(fullTaxTx.rows[0].metadata.tax_dzx), 9);
    assert.equal(Number(fullTaxTx.rows[0].metadata.refund_dzx), 0);
    await pool.query('DELETE FROM activity_tasks WHERE id=$1', [fullTaxTaskId]);

    console.log('Creator campaign tax/refund contract: PASS');
  } catch (error) {
    console.error('Creator campaign tax/refund contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (taskId) await pool.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    if (user) await withTransaction(async client => {
      await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [user.id]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [user.id]);
      await client.query('DELETE FROM users WHERE id=$1', [user.id]);
    });
    await pool.query('DELETE FROM admin_settings WHERE key IN ($1,$2)', [PRICE_KEY, TAX_KEY]);
    await pool.end();
  }
}
main().catch(error => { console.error('Creator campaign tax/refund runner: FAIL'); console.error(error); process.exit(1); });