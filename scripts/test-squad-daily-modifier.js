const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool, withTransaction } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { creditActivityReward } = require('../src/services/economy-service');
const { getDailySquadState, getApplicableSquadModifierOnClient } = require('../src/services/squad-daily-state-service');

test('daily modifier is mapped from contribution and applied only to D+1 qualifying activity', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const ids = [];
  let squadId;
  try {
    const users = [];
    for (let index = 0; index < 3; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `89${suffix}${index}`, username: `squad_mod_${suffix}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[0].id]);
    squadId = squad.rows[0].id;
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active'),($1,$4,'active')", [squadId, users[0].id, users[1].id, users[2].id]);

    const day = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    const nextDayDate = new Date(`${day}T00:00:00Z`);
    nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
    const applicationDay = nextDayDate.toISOString().slice(0, 10);
    await query(`INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,completed_at,verified,metadata) VALUES($1,'task',$2,$3,NOW(),NOW(),TRUE,$4),($5,'task',$6,$7,NOW(),NOW(),TRUE,$8)`, [users[1].id, `verified-a-${suffix}`, `verified-a-${suffix}`, JSON.stringify({ task_id: 'fixture' }), users[2].id, `verified-b-${suffix}`, `verified-b-${suffix}`, JSON.stringify({ task_id: 'fixture' })]);
    await creditActivityReward({ idempotencyKey: `modifier-a-${suffix}`, userId: users[1].id, source: 'task', coin: 0, dzx: 0, dzp: 1500, modifiers: [] });
    await creditActivityReward({ idempotencyKey: `modifier-b-${suffix}`, userId: users[2].id, source: 'task', coin: 0, dzx: 0, dzp: 1, modifiers: [] });
    await getDailySquadState({ squadId, day });

    const applied = await withTransaction(client => getApplicableSquadModifierOnClient(client, { userId: users[1].id, day: applicationDay }));
    assert.equal(applied.rate, '0.15');
    assert.equal(applied.contributor, true);

    const notContributor = await withTransaction(client => getApplicableSquadModifierOnClient(client, { userId: users[0].id, day: applicationDay }));
    assert.equal(notContributor.contributor, false);
    assert.equal(notContributor.rate, '0');

    const reward = await creditActivityReward({ idempotencyKey: `modifier-reward-${suffix}`, userId: users[1].id, source: 'task', coin: 1000, dzx: 1, dzp: 1, modifiers: [], qualifyingVerifiedActivity: true, activityDay: applicationDay });
    assert.equal(reward.entries.find(entry => entry.currency === 'COIN').amount, '1150');
    assert.equal(reward.entries.find(entry => entry.currency === 'DZX').amount, '1.15');
    assert.equal(reward.entries.find(entry => entry.currency === 'DZP').amount, '1');
  } finally {
    if (squadId) await query('DELETE FROM squads WHERE id=$1', [squadId]);
    if (ids.length) {
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [ids]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
      await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
    }
  }
  await pool.end();
});
