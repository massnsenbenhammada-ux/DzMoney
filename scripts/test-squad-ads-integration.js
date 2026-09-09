'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool, withTransaction } = require('../src/db/pool');
const {
  markClientStarted,
  markClientCompleted,
  markProviderConfirmed,
} = require('../src/services/adsgram-correlation-service');
const {
  finalizeTaskAdvertisement,
} = require('../src/services/task-advertisement-service');
const { ADSGRAM_BLOCK_ID } = require('../src/config/adsgram');

async function createUser(marker, role, roleCode) {
  const telegramUserId = String(BigInt(Date.now()) * 10n + BigInt(roleCode));
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [telegramUserId, `squad_${role}_${marker}`, `Squad Ads ${role}`],
  );
  return { id: result.rows[0].id, telegramUserId };
}

async function createTask(userId, marker) {
  return withTransaction(async (client) => {
    for (const currency of ['COIN', 'DZX', 'DZP'])
      await client.query(
        'INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2)',
        [userId, currency],
      );
    const result = await client.query(
      `INSERT INTO activity_tasks (task_type,title,reward_coin,reward_dzx,reward_dzp,status,config) VALUES ('daily','Squad Ads integration test',1000,1,1,'active',$1) RETURNING id`,
      [
        {
          systemKey: 'squad_ads',
          advertisementTarget: 10,
          advertisementContext: 'squad',
          dailyMode: 'advertisement',
        },
      ],
    );
    return result.rows[0].id;
  });
}

async function createEvent(userId, taskId, marker, blockId = ADSGRAM_BLOCK_ID) {
  const result = await pool.query(
    `INSERT INTO activity_ad_events (user_id,context,external_ad_id,idempotency_key,metadata) VALUES ($1,'squad',$2,$3,$4) RETURNING id`,
    [
      userId,
      `adsgram-integration-${marker}`,
      `squad-ads-integration:${marker}`,
      {
        task_id: taskId,
        provider_id: 'adsgram',
        adsgram_block_id: blockId,
        provider_state: {
          client_started: false,
          client_completed: false,
          provider_confirmed: false,
        },
      },
    ],
  );
  return result.rows[0].id;
}

async function main() {
  const marker = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const users = [];
  const taskIds = [];
  try {
    const owner = await createUser(marker, 'owner', 1);
    const other = await createUser(marker, 'other', 2);
    const wrongBlock = await createUser(marker, 'wrongblock', 3);
    users.push(owner, other, wrongBlock);
    const taskId = await createTask(owner.id, marker);
    const otherTaskId = await createTask(other.id, `${marker}-other`);
    const wrongBlockTaskId = await createTask(
      wrongBlock.id,
      `${marker}-wrongblock`,
    );
    taskIds.push(taskId, otherTaskId, wrongBlockTaskId);

    const adEventId = await createEvent(owner.id, taskId, marker);
    const otherEventId = await createEvent(
      other.id,
      otherTaskId,
      `${marker}-other`,
    );
    const wrongBlockEventId = await createEvent(
      wrongBlock.id,
      wrongBlockTaskId,
      `${marker}-wrongblock`,
      '99999',
    );

    await assert.rejects(
      () => markClientCompleted({ userId: owner.id, adEventId }),
      /AdsGram advertisement has not started/,
    );
    await assert.rejects(
      () =>
        markProviderConfirmed({
          userTelegramId: owner.telegramUserId,
          providerReference: `provider:${marker}:prestart`,
        }),
      /No started AdsGram advertisement matches/,
    );
    await markClientStarted({ userId: other.id, adEventId: otherEventId });
    const ownerStart = await markClientStarted({ userId: owner.id, adEventId });
    assert.equal(ownerStart.started, true);
    const ownerProvider = await markProviderConfirmed({
      userTelegramId: owner.telegramUserId,
      providerReference: `provider:${marker}:owner`,
    });
    assert.equal(ownerProvider.ready, false);
    assert.equal(ownerProvider.adEvent.id, adEventId);
    assert.equal(ownerProvider.adEvent.user_id, owner.id);

    const duplicateProvider = await markProviderConfirmed({
      userTelegramId: owner.telegramUserId,
      providerReference: `provider:${marker}:owner-duplicate`,
    });
    assert.equal(duplicateProvider.duplicate, true);
    assert.equal(duplicateProvider.ready, false);

    await markClientStarted({
      userId: wrongBlock.id,
      adEventId: wrongBlockEventId,
    });
    await assert.rejects(
      () =>
        markProviderConfirmed({
          userTelegramId: wrongBlock.telegramUserId,
          providerReference: `provider:${marker}:wrong-block`,
        }),
      /No started AdsGram advertisement matches/,
    );

    const completed = await markClientCompleted({
      userId: owner.id,
      adEventId,
    });
    assert.equal(completed.ready, true);
    assert.equal(completed.adEvent.verified, true);

    const reward = await finalizeTaskAdvertisement({
      userId: owner.id,
      adEventId,
    });
    assert.equal(reward.rewarded, true);
    const balances = await pool.query(
      'SELECT currency,balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency',
      [owner.id],
    );
    const balance = Object.fromEntries(
      balances.rows.map((row) => [row.currency, Number(row.balance)]),
    );
    assert.equal(balance.COIN, 1000);
    assert.equal(balance.DZX, 1);
    assert.equal(balance.DZP, 1);

    const duplicateReward = await finalizeTaskAdvertisement({
      userId: owner.id,
      adEventId,
    });
    assert.equal(duplicateReward.duplicate, true);
    const ledger = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND transaction_type='REWARD' AND metadata->>'source'='advertisement'`,
      [owner.id],
    );
    assert.equal(ledger.rows[0].count, 1);

    const otherState = await pool.query(
      "SELECT verified,metadata->'provider_state' AS provider_state FROM activity_ad_events WHERE id=$1",
      [otherEventId],
    );
    assert.equal(otherState.rows[0].verified, false);
    assert.equal(otherState.rows[0].provider_state.client_started, true);
    assert.equal(otherState.rows[0].provider_state.provider_confirmed, false);

    console.log('Squad Ads integration edge cases: PASS');
  } finally {
    await withTransaction(async (client) => {
      for (const user of users) {
        await client.query(
          'DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)',
          [user.id],
        );
        await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [
          user.id,
        ]);
        await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [
          user.id,
        ]);
        await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [
          user.id,
        ]);
        await client.query('DELETE FROM users WHERE id=$1', [user.id]);
      }
      for (const taskId of taskIds)
        await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    });
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Squad Ads integration edge cases: FAIL');
  console.error(error);
  process.exit(1);
});
