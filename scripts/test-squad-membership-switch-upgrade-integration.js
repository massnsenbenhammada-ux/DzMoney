const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { withTransaction, query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { purchasePaidMembership, switchSquadWithinTier, upgradeSquadTier, settlePendingRequestsForSquad } = require('../src/services/squad-membership-service');

async function createSquad(ownerId, memberIds = []) {
  const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [ownerId]);
  const squadId = squad.rows[0].id;
  const values = [squadId, ownerId, ...memberIds.map(member => member.id ?? member)];
  const placeholders = values.slice(1).map((_, index) => `($1,$${index + 2},'active')`).join(',');
  await query(`INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ${placeholders}`, values);
  return squadId;
}

test('Squad switch and upgrade preserve atomic financial and membership invariants', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = crypto.randomUUID();
  const ids = [];
  const squadIds = [];
  try {
    const users = [];
    for (let index = 0; index < 15; index += 1) {
      const user = await walletService.createUser({ telegramUserId: `7${Date.now()}${index}`, username: `squad_membership_${suffix.slice(0, 8)}_${index}` });
      users.push(user);
      ids.push(user.id);
    }
    squadIds.push(await createSquad(users[0].id), await createSquad(users[1].id));
    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id = $1 AND currency = 'DZP'", [users[13].id]);
    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id = $1 AND currency = 'DZX'", [users[13].id]);

    const purchase = await purchasePaidMembership({ userId: users[13].id, maxMembers: 10, idempotencyKey: `purchase-${suffix}` });
    await query("UPDATE squad_memberships SET status = 'active' WHERE id = $1", [purchase.membership.id]);
    const rateRow = await query("SELECT value FROM admin_settings WHERE key = 'economy.dzx_per_dzp'");
    const rate = Number(rateRow.rows[0]?.value ?? 10);
    const beforeDZX = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[13].id]);
    const switched = await switchSquadWithinTier({ userId: users[13].id, idempotencyKey: `switch-${suffix}` });
    assert.equal(switched.duplicate, false);
    assert.equal(switched.membership.status, 'active');
    assert.notEqual(String(switched.membership.squad_id), String(purchase.membership.squad_id));
    assert.equal(Number(switched.taxDzx), 10 * rate);
    const afterDZX = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[13].id]);
    assert.equal(Number(afterDZX.rows[0].balance), Number(beforeDZX.rows[0].balance) - 10 * rate);
    const duplicate = await switchSquadWithinTier({ userId: users[13].id, idempotencyKey: `switch-${suffix}` });
    assert.equal(duplicate.duplicate, true);
    assert.equal(String(duplicate.membership.squad_id), String(switched.membership.squad_id));
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZX'", [users[13].id])).rows[0].balance), Number(afterDZX.rows[0].balance));

    const thirdSquad = await createSquad(users[2].id);
    squadIds.push(thirdSquad);
    await query("UPDATE wallet_accounts SET balance = 0 WHERE user_id = $1 AND currency = 'DZX'", [users[13].id]);
    await assert.rejects(() => switchSquadWithinTier({ userId: users[13].id, idempotencyKey: `switch-insufficient-${suffix}` }), /Insufficient DZX balance/);
    const unchanged = await query('SELECT squad_id, status FROM squad_memberships WHERE id = $1', [switched.membership.id]);
    assert.equal(String(unchanged.rows[0].squad_id), String(switched.membership.squad_id));
    assert.equal(unchanged.rows[0].status, 'active');

    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id IN ($1, $2) AND currency = 'DZP'", [users[10].id, users[11].id]);
    const deferredPurchase = await purchasePaidMembership({ userId: users[10].id, maxMembers: 10, idempotencyKey: `deferred-purchase-${suffix}` });
    const invalidationPurchase = await purchasePaidMembership({ userId: users[11].id, maxMembers: 10, idempotencyKey: `invalidation-purchase-${suffix}` });
    await query("UPDATE squad_memberships SET status = 'active' WHERE id IN ($1, $2)", [deferredPurchase.membership.id, invalidationPurchase.membership.id]);
    const beforeDeferredBalance = Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[10].id])).rows[0].balance);
    const beforeInvalidationBalance = Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[11].id])).rows[0].balance);

    const deferredUpgrade = await upgradeSquadTier({ userId: users[10].id, newMaxMembers: 20, idempotencyKey: `deferred-upgrade-${suffix}` });
    assert.equal(deferredUpgrade.duplicate, false);
    assert.equal(deferredUpgrade.status, 'pending');
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[10].id])).rows[0].balance), beforeDeferredBalance);

    const invalidationUpgrade = await upgradeSquadTier({ userId: users[11].id, newMaxMembers: 20, idempotencyKey: `invalidated-upgrade-${suffix}` });
    assert.equal(invalidationUpgrade.status, 'pending');
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[11].id])).rows[0].balance), beforeInvalidationBalance);
    await query("UPDATE squad_memberships SET status = 'suspended' WHERE id = $1", [invalidationPurchase.membership.id]);

    const targetMemberA = await walletService.createUser({ telegramUserId: `7${Date.now()}a`, username: `squad_target_a_${suffix.slice(0, 8)}` });
    const targetMemberB = await walletService.createUser({ telegramUserId: `7${Date.now()}b`, username: `squad_target_b_${suffix.slice(0, 8)}` });
    ids.push(targetMemberA.id, targetMemberB.id);
    const deferredTargetSquad = await createSquad(users[3].id, [users[4].id, users[5].id, users[6].id, users[7].id, users[8].id, users[9].id, users[12].id, users[14].id, targetMemberA.id, targetMemberB.id]);
    squadIds.push(deferredTargetSquad);
    await withTransaction(client => settlePendingRequestsForSquad(client, deferredTargetSquad));

    const deferredRequest = await query("SELECT status FROM squad_membership_purchase_requests WHERE user_id = $1 AND idempotency_key = $2", [users[10].id, `deferred-upgrade-${suffix}`]);
    const invalidatedRequest = await query("SELECT status FROM squad_membership_purchase_requests WHERE user_id = $1 AND idempotency_key = $2", [users[11].id, `invalidated-upgrade-${suffix}`]);
    assert.equal(deferredRequest.rows[0].status, 'settled');
    assert.equal(invalidatedRequest.rows[0].status, 'invalidated');
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[10].id])).rows[0].balance), beforeDeferredBalance - 200);
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[11].id])).rows[0].balance), beforeInvalidationBalance);
    const deferredMemberships = await query("SELECT status, squad_id FROM squad_memberships WHERE user_id = $1 ORDER BY id", [users[10].id]);
    assert.equal(deferredMemberships.rows.filter(row => row.status !== 'cancelled').length, 1);
    assert.equal(String(deferredMemberships.rows.find(row => row.status === 'inactive').squad_id), String(deferredTargetSquad));
    const invalidatedMemberships = await query("SELECT status, squad_id FROM squad_memberships WHERE user_id = $1 ORDER BY id", [users[11].id]);
    assert.equal(invalidatedMemberships.rows.filter(row => row.status !== 'cancelled').length, 1);
    assert.equal(invalidatedMemberships.rows[0].status, 'suspended');

    await query("UPDATE wallet_accounts SET balance = 1000 WHERE user_id = $1 AND currency = 'DZP'", [users[13].id]);
    const beforeUpgrade = await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[13].id]);
    const upgraded = await upgradeSquadTier({ userId: users[13].id, newMaxMembers: 20, idempotencyKey: `upgrade-${suffix}` });
    assert.equal(upgraded.duplicate, false);
    assert.equal(Number(upgraded.price), 200);
    assert.equal(upgraded.membership.status, 'inactive');
    assert.equal(Number((await query("SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP'", [users[13].id])).rows[0].balance), Number(beforeUpgrade.rows[0].balance) - 200);
    const memberships = await query('SELECT id, squad_id, status FROM squad_memberships WHERE user_id = $1 ORDER BY id', [users[13].id]);
    assert.equal(memberships.rows.filter(row => row.status !== 'cancelled').length, 1);
    assert.equal(String(memberships.rows.find(row => String(row.id) === String(purchase.membership.id)).status), 'cancelled');
    assert.equal(String(memberships.rows.find(row => String(row.id) === String(upgraded.membership.id)).status), 'inactive');
    await assert.rejects(() => upgradeSquadTier({ userId: users[13].id, newMaxMembers: 10, idempotencyKey: `upgrade-lower-${suffix}` }), /higher than the current membership tier/);
  } finally {
    if (ids.length) {
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [ids]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [ids]);
      await query('DELETE FROM squad_memberships WHERE user_id = ANY($1::bigint[])', [ids]);
    }
    if (squadIds.length) await query('DELETE FROM squads WHERE id = ANY($1::bigint[])', [squadIds]);
    if (ids.length) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);
  }
  await pool.end();
});
