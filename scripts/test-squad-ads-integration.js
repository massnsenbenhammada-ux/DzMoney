'use strict';

const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { markClientStarted, markClientCompleted, markProviderConfirmed } = require('../src/services/adsgram-correlation-service');
const { finalizeTaskAdvertisement } = require('../src/services/task-advertisement-service');

async function main() {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const telegramUserId = `squad_ads_integration_${marker}`;
  let userId;
  let taskId;
  let adEventId;
  try {
    const user = await pool.query(
      `INSERT INTO users (telegram_user_id, username, first_name)
       VALUES ($1,$2,$3) RETURNING id`,
      [telegramUserId, `squad_ads_${marker}`, 'Squad Ads Integration']
    );
    userId = user.rows[0].id;
    await withTransaction(async client => {
      for (const currency of ['COIN', 'DZX', 'DZP']) {
        await client.query(
          'INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2)',
          [userId, currency]
        );
      }
      const task = await client.query(
        `INSERT INTO activity_tasks
          (task_type,title,reward_coin,reward_dzx,reward_dzp,status,config)
         VALUES ('daily','Squad Ads integration test',1000,1,1,'active',
           '{"systemKey":"squad_ads","advertisementTarget":10,"advertisementContext":"squad","dailyMode":"advertisement"}')
         RETURNING id`,
        []
      );
      taskId = task.rows[0].id;
      const event = await client.query(
        `INSERT INTO activity_ad_events
          (user_id,context,external_ad_id,idempotency_key,metadata)
         VALUES ($1,'squad',$2,$3,$4) RETURNING id`,
        [userId, `adsgram-integration-${marker}`, `squad-ads-integration:${marker}`, {
          task_id: taskId,
          provider_id: 'adsgram',
          adsgram_block_id: '44442',
          provider_state: { client_started: false, client_completed: false, provider_confirmed: false }
        }]
      );
      adEventId = event.rows[0].id;
    });

    await assert.rejects(
      () => markClientCompleted({ userId, adEventId }),
      /AdsGram advertisement has not started/
    );

    const providerFirst = await markProviderConfirmed({ userTelegramId: telegramUserId, providerReference: `provider:${marker}` });
    assert.equal(providerFirst.ready, false);
    assert.equal(providerFirst.adEvent.verified, false);

    const started = await markClientStarted({ userId, adEventId });
    assert.equal(started.started, true);
    assert.equal(started.adEvent.metadata.provider_state.client_started, true);

    const completed = await markClientCompleted({ userId, adEventId });
    assert.equal(completed.ready, true);
    assert.equal(completed.adEvent.verified, true);

    const reward = await finalizeTaskAdvertisement({ userId, adEventId });
    assert.equal(reward.rewarded, true);

    const balances = await pool.query(
      `SELECT currency,balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency`,
      [userId]
    );
    const balance = Object.fromEntries(balances.rows.map(row => [row.currency, Number(row.balance)]));
    assert.equal(balance.COIN, 1000);
    assert.equal(balance.DZX, 1);
    assert.equal(balance.DZP, 1);

    const duplicateReward = await finalizeTaskAdvertisement({ userId, adEventId });
    assert.equal(duplicateReward.duplicate, true);
    const ledger = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND type='ACTIVITY_REWARD'`,
      [userId]
    );
    assert.equal(ledger.rows[0].count, 1);

    console.log('Squad Ads integration invariants: PASS');
  } finally {
    await withTransaction(async client => {
      if (userId) {
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM users WHERE id=$1', [userId]);
      }
      if (taskId) await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    });
    await pool.end();
  }
}

main().catch(error => {
  console.error('Squad Ads integration invariants: FAIL');
  console.error(error);
  process.exit(1);
});
