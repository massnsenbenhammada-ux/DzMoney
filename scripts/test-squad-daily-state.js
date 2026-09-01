const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { creditActivityReward } = require('../src/services/economy-service');
const { getDailySquadState } = require('../src/services/squad-daily-state-service');

async function verifiedAd(userId, suffix) {
  await query(
    `INSERT INTO activity_ad_events(user_id,context,idempotency_key,started_at,completed_at,verified)
     VALUES($1,'verification',$2,NOW(),NOW(),TRUE)`,
    [userId, `daily-state-ad:${suffix}`]
  );
}

test('daily Squad state uses verified activity, target OR 50%, and freezes eligible count', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const ids = [];
  let squadId;
  try {
    const users = [];
    for (let index = 0; index < 5; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `8${suffix}${index + 1}`, username: `squad_daily_${suffix}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[0].id]);
    squadId = squad.rows[0].id;
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active'),($1,$4,'inactive')", [squadId, users[0].id, users[1].id, users[2].id]);

    const first = await getDailySquadState({ squadId });
    assert.equal(first.eligibleMemberCount, 3);
    assert.equal(first.dailyTarget, '30.000000000');
    assert.equal(first.activeMemberCount, 0);
    assert.equal(first.dzpContribution, '0');
    assert.equal(first.status, 'risk');

    await verifiedAd(users[1].id, `${suffix}-a`);
    await creditActivityReward({ idempotencyKey: `daily-state-a-${suffix}`, userId: users[1].id, source: 'advertisement', coin: 0, dzx: 0, dzp: 1, modifiers: [] });
    await verifiedAd(users[2].id, `${suffix}-b`);
    await creditActivityReward({ idempotencyKey: `daily-state-b-${suffix}`, userId: users[2].id, source: 'task', coin: 0, dzx: 0, dzp: 1, modifiers: [] });
    const activityReached = await getDailySquadState({ squadId });
    assert.equal(activityReached.activeMemberCount, 2);
    assert.equal(activityReached.dzpContribution, '2');
    assert.equal(activityReached.status, 'active');
    assert.equal(activityReached.activationReason, 'activity');

    await creditActivityReward({ idempotencyKey: `daily-state-c-${suffix}`, userId: users[1].id, source: 'task', coin: 0, dzx: 0, dzp: 28, modifiers: [] });
    const targetReached = await getDailySquadState({ squadId });
    assert.equal(targetReached.activeMemberCount, 2);
    assert.equal(targetReached.dzpContribution, '30');
    assert.equal(targetReached.status, 'active');
    assert.equal(targetReached.activationReason, 'both');

    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active')", [squadId, users[3].id]);
    const frozen = await getDailySquadState({ squadId });
    assert.equal(frozen.eligibleMemberCount, 3);
    assert.equal(frozen.dailyTarget, '30.000000000');
  } finally {
    if (squadId) await query('DELETE FROM squads WHERE id=$1', [squadId]);
    if (ids.length) {
      await query('DELETE FROM activity_ad_events WHERE user_id = ANY($1::bigint[])', [ids]);
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [ids]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
      await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
    }
  }
  await pool.end();
});