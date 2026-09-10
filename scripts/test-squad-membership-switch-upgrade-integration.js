const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { purchasePaidMembership, switchSquadWithinTier, upgradeSquadTier } = require('../src/services/squad-membership-service');

async function createSquad(ownerId, memberIds = []) {
  const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [ownerId]);
  const squadId = squad.rows[0].id;
  const values = [squadId, ownerId, ...memberIds];
  const placeholders = values.slice(1).map((_, index) => `($1,$${index + 2},'active')`).join(',');
  await query(`INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ${placeholders}`, values);
  return squadId;
}

test('Squad switch charges the configured tax, preserves active status, and is idempotent', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const ids = [];
  const squadIds = [];
  try {
    const users = [];
    for (let index = 0; index < 6; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `8${suffix}${index}`, username: `squad_switch_${suffix}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    squadIds.push(await createSquad(users[0].id), await createSquad(users[1].id));
    await query("UPDATE wallet_accounts SET balance = 500 WHERE user_id = $1 AND currency = 'DZP'", [users[5].id]);
    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id = $1 AND currency = 'DZX'", [users[5].id]);
    const purchase = await purchasePaidMembership({ userId: users[5].id, maxMembers: 10, idempotencyKey: `purchase-${suffix}` });
    await query("UPDATE squad_memberships SET status = 'active' WHERE id = $1", [purchase.membership.id]);
    const rateRow = await query("SELECT value FROM admin_settings WHERE key = 'economy.dzx_per_dzp'");
    const rate = Number(rateRow.rows[0]?.value ?? 10);
    const before = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[5].id]);
    const switched = await switchSquadWithinTier({ userId: users[5].id, idempotencyKey: `switch-${suffix}` });
    assert.equal(switched.duplicate, false);
    assert.equal(switched.membership.status, 'active');
    assert.notEqual(String(switched.membership.squad_id), String(purchase.membership.squad_id));
    assert.equal(Number(switched.taxDzx), 10 * rate);
    const after = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[5].id]);
    assert.equal(Number(after.rows[0].balance), Number(before.rows[0].balance) - 10 * rate);
    const duplicate = await switchSquadWithinTier({ userId: users[5].id, idempotencyKey: `switch-${suffix}` });
    assert.equal(duplicate.duplicate, true);
    assert.equal(String(duplicate.membership.squad_id), String(switched.membership.squad_id));
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[5].id])).rows[0].balance), Number(after.rows[0].balance));
  } finally {
    if (ids.length) {
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [ids]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
    }
    if (squadIds.length) await query('DELETE FROM squads WHERE id = ANY($1::bigint[])', [squadIds]);
    if (ids.length) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
  }
  await pool.end();
});

test('Squad upgrade requires a higher tier, burns the full new price, and replaces the old membership', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const ids = [];
  const squadIds = [];
  try {
    const users = [];
    for (let index = 0; index < 14; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `7${suffix}${index}`, username: `squad_upgrade_${suffix}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    squadIds.push(await createSquad(users[0].id), await createSquad(users[1].id, users.slice(2, 12)));
    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id = $1 AND currency = 'DZP'", [users[13].id]);
    const purchase = await purchasePaidMembership({ userId: users[13].id, maxMembers: 10, idempotencyKey: `purchase-upgrade-${suffix}` });
    const before = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[13].id]);
    const upgraded = await upgradeSquadTier({ userId: users[13].id, newMaxMembers: 20, idempotencyKey: `upgrade-${suffix}` });
    assert.equal(upgraded.duplicate, false);
    assert.equal(Number(upgraded.price), 200);
    assert.equal(upgraded.membership.status, 'inactive');
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[13].id])).rows[0].balance), Number(before.rows[0].balance) - 200);
    const memberships = await query('SELECT id, squad_id, status FROM squad_memberships WHERE user_id = $1 ORDER BY id', [users[13].id]);
    assert.equal(memberships.rowCount, 2);
    assert.equal(memberships.rows.filter(row => row.status !== 'cancelled').length, 1);
    assert.equal(String(memberships.rows[0].id), String(purchase.membership.id));
    assert.equal(memberships.rows[0].status, 'cancelled');
    assert.equal(String(memberships.rows[1].id), String(upgraded.membership.id));
    await assert.rejects(() => upgradeSquadTier({ userId: users[13].id, newMaxMembers: 10, idempotencyKey: `upgrade-lower-${suffix}` }), /higher than the current membership tier/);
  } finally {
    if (ids.length) {
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [ids]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
    }
    if (squadIds.length) await query('DELETE FROM squads WHERE id = ANY($1::bigint[])', [squadIds]);
    if (ids.length) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
  }
  await pool.end();
});
