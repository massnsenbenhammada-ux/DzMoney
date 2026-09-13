const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const squadMembershipService = require('../src/services/squad-membership-service');

const phase4Test = { skip: !process.env.DATABASE_URL };

function suffix() {
  return `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

async function createUser(tag, balance) {
  const telegramUserId = String(900000000 + (Date.now() % 100000000));
  const user = await walletService.createUser({
    telegramUserId,
    username: `phase4_scope_${tag}_${suffix()}`
  });
  await query("UPDATE wallet_accounts SET balance=$1 WHERE user_id=$2 AND currency='DZP'", [balance, user.id]);
  return user;
}

async function cleanup({ userIds, squadIds = [], taskIds = [], attributionUserIds = [] }) {
  if (attributionUserIds.length) await query('DELETE FROM referral_attributions WHERE referred_user_id = ANY($1::bigint[])', [attributionUserIds]);
  if (taskIds.length) {
    await query('DELETE FROM task_attempts WHERE task_id = ANY($1::bigint[])', [taskIds]);
    await query('DELETE FROM activity_tasks WHERE id = ANY($1::bigint[])', [taskIds]);
  }
  if (userIds.length) {
    await query('DELETE FROM squad_membership_purchase_requests WHERE user_id = ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))', [userIds]);
    await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM squad_memberships WHERE user_id = ANY($1::bigint[])', [userIds]);
  }
  if (squadIds.length) await query('DELETE FROM squads WHERE id = ANY($1::bigint[])', [squadIds]);
  if (userIds.length) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
}

test('Phase 4 Option B: T2-T10 pending requests never pair with each other', phase4Test, async () => {
  const first = await createUser('t10-first', 10000);
  const second = await createUser('t10-second', 10000);
  const users = [first, second];
  try {
    const firstResult = await squadMembershipService.purchasePaidMembership({ userId: first.id, maxMembers: null, idempotencyKey: `scope-t10-first-${suffix()}` });
    assert.equal(firstResult.status, 'pending');
    const secondResult = await squadMembershipService.purchasePaidMembership({ userId: second.id, maxMembers: null, idempotencyKey: `scope-t10-second-${suffix()}` });
    assert.equal(secondResult.status, 'pending');
    const pending = await query(`SELECT COUNT(*)::int AS count FROM squad_membership_purchase_requests WHERE user_id = ANY($1::bigint[]) AND status='pending'`, [[first.id, second.id]]);
    assert.equal(pending.rows[0].count, 2);
    const squads = await query('SELECT COUNT(*)::int AS count FROM squads WHERE owner_user_id = ANY($1::bigint[])', [[first.id, second.id]]);
    assert.equal(squads.rows[0].count, 0);
    const balances = await query("SELECT user_id,balance FROM wallet_accounts WHERE currency='DZP' AND user_id=ANY($1::bigint[]) ORDER BY user_id", [[first.id, second.id]]);
    assert.deepEqual(balances.rows.map(row => Number(row.balance)), [10000, 10000]);
  } finally {
    await cleanup({ userIds: users.map(user => user.id) });
  }
});

test('Phase 4 Option B: paid-created Squad accepts later qualified referral without charge or duplicate Squad', phase4Test, async () => {
  const owner = await createUser('paid-owner', 100);
  const paidMember = await createUser('paid-member', 100);
  const referred = await createUser('referred', 0);
  const users = [owner, paidMember, referred];
  const squads = [];
  const taskIds = [];
  try {
    const first = await squadMembershipService.purchasePaidMembership({ userId: owner.id, maxMembers: 10, idempotencyKey: `scope-paid-first-${suffix()}` });
    assert.equal(first.status, 'pending');
    const second = await squadMembershipService.purchasePaidMembership({ userId: paidMember.id, maxMembers: 10, idempotencyKey: `scope-paid-second-${suffix()}` });
    assert.equal(second.status, 'settled');
    const paidSquad = await query('SELECT id FROM squads WHERE owner_user_id=$1 ORDER BY id DESC LIMIT 1', [owner.id]);
    assert.equal(paidSquad.rowCount, 1);
    squads.push(paidSquad.rows[0].id);

    await referralService.createAttribution({ referrerUserId: owner.id, referredUserId: referred.id });
    const formation = await squadMembershipService.ensureReferralSquadFormation({ referrerUserId: owner.id, referredUserId: referred.id });
    assert.equal(formation.joined, true);
    assert.equal(String(formation.squadId), String(squads[0]));

    const task = await query("INSERT INTO activity_tasks(task_type,title,reward_coin) VALUES('game','Phase 4 paid squad referral qualification',1) RETURNING id");
    taskIds.push(task.rows[0].id);
    const attempt = await query(`INSERT INTO task_attempts(task_id,user_id,status,execute_idempotency_key,verified_at) VALUES($1,$2,'verified',$3,NOW()) RETURNING id`, [task.rows[0].id, referred.id, `scope-referral-attempt-${suffix()}`]);
    const qualified = await referralService.qualifyReferral({ referredUserId: referred.id, source: 'task', referenceId: attempt.rows[0].id, idempotencyKey: `scope-referral-qualification-${suffix()}` });
    assert.equal(qualified.attribution.status, 'qualified');

    const membership = await query("SELECT squad_id,status FROM squad_memberships WHERE user_id=$1 AND status IN ('active','inactive','suspended')", [referred.id]);
    assert.equal(membership.rowCount, 1);
    assert.equal(String(membership.rows[0].squad_id), String(squads[0]));
    assert.equal(await query('SELECT COUNT(*)::int AS count FROM squads WHERE owner_user_id=$1', [owner.id]).then(r => r.rows[0].count), 1);
    assert.equal(await query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND transaction_type='SQUAD_MEMBERSHIP_PURCHASE'", [referred.id]).then(r => r.rows[0].count), 0);
  } finally {
    await cleanup({ userIds: users.map(user => user.id), squadIds: squads, taskIds, attributionUserIds: [referred.id] });
  }
});

pool.on('error', () => {});
