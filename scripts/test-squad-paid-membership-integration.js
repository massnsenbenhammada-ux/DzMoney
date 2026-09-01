const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { purchasePaidMembership } = require('../src/services/squad-membership-service');

test('paid membership burns DZP, selects the smallest eligible Squad, starts inactive, and is idempotent', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const ids = [];
  const squadIds = [];
  try {
    const users = [];
    for (let index = 0; index < 7; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `9${suffix}${index + 1}`, username: `squad_paid_${suffix}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    const firstSquad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[0].id]);
    const secondSquad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[1].id]);
    squadIds.push(firstSquad.rows[0].id, secondSquad.rows[0].id);
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active'),($1,$4,'active'),($5,$6,'active'),($5,$7,'active')", [squadIds[0], users[0].id, users[2].id, users[3].id, squadIds[1], users[1].id, users[4].id]);
    await query("UPDATE wallet_accounts SET balance = 500 WHERE user_id = $1 AND currency = 'DZP'", [users[5].id]);

    const first = await purchasePaidMembership({ userId: users[5].id, maxMembers: 10, idempotencyKey: `paid-${suffix}` });
    assert.equal(first.duplicate, false);
    assert.equal(String(first.membership.squad_id), String(squadIds[1]));
    assert.equal(first.membership.status, 'inactive');
    assert.equal(Number(first.price), 100);

    const balance = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[5].id]);
    assert.equal(Number(balance.rows[0].balance), 400);

    const duplicate = await purchasePaidMembership({ userId: users[5].id, maxMembers: 10, idempotencyKey: `paid-${suffix}` });
    assert.equal(duplicate.duplicate, true);
    assert.equal(String(duplicate.membership.squad_id), String(squadIds[1]));

    const memberships = await query("SELECT COUNT(*)::int AS count FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled'", [users[5].id]);
    assert.equal(memberships.rows[0].count, 1);
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
