const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const { createCreatorCampaign } = require('../src/services/task-service');

const PRICE_KEY = 'task.campaign_price_dzx_per_execution';

async function main() {
  let user;
  let taskId;
  const marker = `campaign-economics-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    user = await createUser({
      telegramUserId: -Date.now(),
      username: marker,
      firstName: 'Campaign Economics Test'
    });

    // The Admin price is a backend setting; the Creator supplies only target.
    await pool.query(
      `INSERT INTO admin_settings(key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [PRICE_KEY, '9']
    );

    await postEconomyTransaction({
      idempotencyKey: `${marker}:fund`,
      userId: user.id,
      type: 'TEST_CREDIT',
      metadata: { source: 'test' },
      movements: [{ currency: 'DZX', amount: 10000, source: 'test' }]
    });

    const campaign = await createCreatorCampaign({
      taskType: 'social',
      title: 'Campaign economics contract',
      creatorId: user.id,
      target: 1000,
      rewardCoin: 1000,
      rewardDzx: 1,
      rewardDzp: 1,
      verificationAdSeconds: 5,
      config: { test: true }
    });

    taskId = campaign.task.id;
    assert.equal(Number(campaign.appliedPriceDZX), 9);
    assert.equal(Number(campaign.campaignCostDZX), 9000);
    assert.equal(Number(campaign.task.target), 1000);
    assert.equal(String(campaign.task.creator_id), String(user.id));

    const wallet = await pool.query(
      `SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'`,
      [user.id]
    );
    assert.equal(Number(wallet.rows[0].balance), 1000);

    const ledger = await pool.query(
      `SELECT lt.metadata, le.amount, le.source
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.user_id = $1 AND le.source = 'creator_campaign'
       ORDER BY le.id DESC LIMIT 1`,
      [user.id]
    );
    assert.equal(Number(ledger.rows[0].amount), -9000);
    assert.equal(ledger.rows[0].metadata.target, 1000);
    assert.equal(Number(ledger.rows[0].metadata.applied_price_dzx), 9);
    assert.equal(Number(ledger.rows[0].metadata.campaign_cost_dzx), 9000);

    // A campaign must never calculate its authoritative price from Creator input.
    await assert.rejects(
      () => createCreatorCampaign({
        taskType: 'social',
        title: 'Client price injection',
        creatorId: user.id,
        target: 1,
        priceDZX: 1,
        rewardCoin: 1000,
        rewardDzx: 1,
        rewardDzp: 1,
        verificationAdSeconds: 5
      }),
      /price.*server|price.*admin|unexpected.*price/i
    );

    console.log('Creator campaign economics contract: PASS');
  } catch (error) {
    console.error('Creator campaign economics contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (taskId) {
      await pool.query('DELETE FROM activity_tasks WHERE id = $1', [taskId]);
    }
    if (user) {
      await withTransaction(async client => {
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)', [user.id]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM users WHERE id = $1', [user.id]);
      });
    }
    await pool.query('DELETE FROM admin_settings WHERE key = $1', [PRICE_KEY]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Creator campaign economics runner: FAIL');
  console.error(error);
  process.exit(1);
});
