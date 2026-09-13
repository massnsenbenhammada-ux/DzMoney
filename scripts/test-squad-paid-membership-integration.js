const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { purchasePaidMembership } = require('../src/services/squad-membership-service');

async function createUser(suffix, index, balance = 0) {
  const user = await walletService.createUser({ telegramUserId: `9${suffix}${index}`, username: `squad_phase4_${suffix}_${index}` });
  await query("UPDATE wallet_accounts SET balance = $1 WHERE user_id = $2 AND currency = 'DZP'", [balance, user.id]);
  return user;
}

async function cleanup({ userIds = [], squadIds = [] }) {
  if (userIds.length) {
    await query('DELETE FROM squad_membership_purchase_requests WHERE user_id = ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [userIds]);
    await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM squad_memberships WHERE user_id = ANY($1::bigint[])', [userIds]);
  }
  if (squadIds.length) await query('DELETE FROM squads WHERE id = ANY($1::bigint[])', [squadIds]);
  if (userIds.length) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
}

async function dzpBalance(userId) {
  const result = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [userId]);
  return Number(result.rows[0]?.balance);
}

test('Phase 4 paid membership: affordability, pending persistence, first-two settlement, deterministic third join, and idempotency', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squadIds = [];
  try {
    users.push(await createUser(suffix, 1, 100));
    users.push(await createUser(suffix, 2, 100));
    users.push(await createUser(suffix, 3, 100));

    const first = await purchasePaidMembership({ userId: users[0].id, maxMembers: 10, idempotencyKey: 'first' });
    assert.equal(first.status, 'pending');
    assert.equal(first.transaction, undefined);
    assert.equal(await dzpBalance(users[0].id), 100);
    const pending = await query("SELECT user_id,status FROM squad_membership_purchase_requests WHERE user_id=$1", [users[0].id]);
    assert.equal(pending.rows.length, 1);
    assert.equal(pending.rows[0].status, 'pending');

    const second = await purchasePaidMembership({ userId: users[1].id, maxMembers: 10, idempotencyKey: 'second' });
    assert.equal(second.status, 'settled');
    assert.equal(String(second.ownerUserId), String(users[0].id));
    assert.equal(second.settledMemberships.length, 2);
    assert.equal(await dzpBalance(users[0].id), 0);
    assert.equal(await dzpBalance(users[1].id), 0);

    const squad = await query('SELECT id,owner_user_id FROM squads WHERE owner_user_id=$1 ORDER BY id DESC LIMIT 1', [users[0].id]);
    assert.equal(squad.rows.length, 1);
    squadIds.push(squad.rows[0].id);

    const third = await purchasePaidMembership({ userId: users[2].id, maxMembers: 10, idempotencyKey: 'third' });
    assert.equal(third.status, 'settled');
    assert.equal(String(third.membership.squad_id), String(squad.rows[0].id));
    assert.equal(await dzpBalance(users[2].id), 0);

    const repeat = await purchasePaidMembership({ userId: users[2].id, maxMembers: 10, idempotencyKey: 'third' });
    assert.equal(repeat.duplicate, true);
    assert.equal(repeat.status, 'settled');
    assert.equal(await dzpBalance(users[2].id), 0);

    const counts = await query("SELECT squad_id,COUNT(*)::int AS count FROM squad_memberships WHERE user_id = ANY($1::bigint[]) AND status <> 'cancelled' GROUP BY squad_id", [[users[0].id, users[1].id, users[2].id]]);
    assert.equal(counts.rows.length, 1);
    assert.equal(counts.rows[0].count, 3);
  } finally {
    await cleanup({ userIds: users.map(user => user.id), squadIds });
  }
});

test('Phase 4 paid membership: insufficient DZP is rejected without pending request or ledger mutation', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  try {
    users.push(await createUser(suffix, 1, 99));
    await assert.rejects(() => purchasePaidMembership({ userId: users[0].id, maxMembers: 10, idempotencyKey: 'insufficient' }), /Insufficient DZP balance/);
    assert.equal(await dzpBalance(users[0].id), 99);
    const pending = await query('SELECT COUNT(*)::int AS count FROM squad_membership_purchase_requests WHERE user_id=$1', [users[0].id]);
    const ledger = await query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND transaction_type='SQUAD_MEMBERSHIP_PURCHASE'", [users[0].id]);
    assert.equal(pending.rows[0].count, 0);
    assert.equal(ledger.rows[0].count, 0);
  } finally {
    await cleanup({ userIds: users.map(user => user.id) });
  }
});

test('Phase 4 paid membership: smallest eligible Squad wins with deterministic id tie-break', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squadIds = [];
  try {
    for (let index = 1; index <= 6; index += 1) users.push(await createUser(suffix, index, index === 6 ? 100 : 0));
    const firstSquad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[0].id]);
    const secondSquad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[1].id]);
    squadIds.push(firstSquad.rows[0].id, secondSquad.rows[0].id);
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active'),($2,$4,'active'),($2,$5,'active')", [squadIds[0], users[0].id, users[1].id, users[2].id, users[3].id]);
    const result = await purchasePaidMembership({ userId: users[5].id, maxMembers: 10, idempotencyKey: 'smallest' });
    assert.equal(result.status, 'settled');
    assert.equal(String(result.membership.squad_id), String(squadIds[0] < squadIds[1] ? squadIds[0] : squadIds[1]));
  } finally {
    await cleanup({ userIds: users.map(user => user.id), squadIds });
  }
});

pool.on('error', () => {});
