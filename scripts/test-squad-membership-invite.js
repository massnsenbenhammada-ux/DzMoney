const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations/032_squad_membership_invites.sql'), 'utf8');
const membership = fs.readFileSync(path.join(root, 'src/services/squad-membership-service.js'), 'utf8');
const taskVerification = fs.readFileSync(path.join(root, 'src/services/task-verification-service.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/http/squad-routes.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public/squad.js'), 'utf8');

test('membership migration supports inactive invitation membership without a second membership table', () => {
  assert.match(migration, /status IN \('inactive', 'active', 'suspended', 'cancelled'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS squad_invitations/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_squad_pending_invitation/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS .*membership/i);
});

test('invitation service enforces owner, one-membership and inactive acceptance rules', () => {
  assert.match(membership, /Only the squad owner can invite/);
  assert.match(membership, /status IN \('active', 'inactive', 'suspended'\)/);
  assert.match(membership, /status = 'pending'/);
  assert.match(membership, /VALUES \(\$1, \$2, 'inactive'\)/);
  assert.match(membership, /User already has a squad membership/);
});

test('verified task completion activates membership inside the existing economy transaction', () => {
  assert.match(taskVerification, /activateOnVerifiedActivity\(client, row\.user_id\)/);
  const rewardIndex = taskVerification.indexOf('creditActivityRewardOnClient(client');
  const activationIndex = taskVerification.indexOf('activateOnVerifiedActivity(client, row.user_id)');
  assert.ok(rewardIndex >= 0 && activationIndex > rewardIndex);
});

test('frontend consumes the invitation API and never decides membership activation', () => {
  assert.match(frontend, /\/api\/squad\/invitations/);
  assert.match(frontend, /\/accept/);
  assert.doesNotMatch(frontend, /status\s*=\s*['"]active['"]/);
  assert.doesNotMatch(frontend, /membershipStatus\s*=\s*['"]active['"]/);
});

test('Phase 5 runtime contract is bounded, FIFO, scoped, non-recursive and post-commit notified', () => {
  assert.match(membership, /settlePendingRequestsForSquad/);
  assert.match(membership, /ORDER BY created_at ASC, id ASC/);
  assert.match(membership, /FOR UPDATE SKIP LOCKED/);
  assert.match(membership, /remainingCapacity/);
  assert.match(membership, /squad-membership:\$\{request\.user_id\}:\$\{request\.idempotency_key\}/);
  assert.match(membership, /await notifyDeferredMemberships\(notificationUserIds\)/);
  assert.match(membership, /INSERT INTO squad_memberships \(squad_id, user_id, status\) VALUES \(\$1, \$2, 'inactive'\)/);
  const helperStart = membership.indexOf('async function settlePendingRequestsForSquad');
  const helperEnd = membership.indexOf('async function notifyDeferredMemberships', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helperBody = membership.slice(membership.indexOf('{', helperStart) + 1, helperEnd);
  assert.doesNotMatch(helperBody, /settlePendingRequestsForSquad\(client/);
  assert.match(membership, /PHASE5_NOTIFICATION/);
});

const phase5Integration = { skip: !process.env.DATABASE_URL };

function phase5Suffix() {
  return `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function phase5CreateUser(walletService, tag, index, balance = 10000) {
  const user = await walletService.createUser({ telegramUserId: String(920000000 + ((Date.now() % 1000000) * 1000) + index), username: `phase5_invite_${tag}_${index}_${Date.now()}` });
  const { query } = require('../src/db/pool');
  await query("UPDATE wallet_accounts SET balance=$1 WHERE user_id=$2 AND currency='DZP'", [balance, user.id]);
  return user;
}

async function phase5Cleanup({ users, squads }) {
  const { query } = require('../src/db/pool');
  const userIds = users.map(user => user.id);
  if (userIds.length) {
    await query('DELETE FROM squad_membership_purchase_requests WHERE user_id=ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=ANY($1::bigint[])) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=ANY($1::bigint[]))', [userIds]);
    await query('DELETE FROM ledger_transactions WHERE user_id=ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM squad_invitations WHERE inviter_user_id=ANY($1::bigint[]) OR invitee_user_id=ANY($1::bigint[])', [userIds]);
    await query('DELETE FROM squad_memberships WHERE user_id=ANY($1::bigint[])', [userIds]);
  }
  if (squads.length) await query('DELETE FROM squads WHERE id=ANY($1::bigint[])', [squads]);
  if (userIds.length) await query('DELETE FROM users WHERE id=ANY($1::bigint[])', [userIds]);
}

async function phase5AddActiveMembers(squadId, users) {
  const { query } = require('../src/db/pool');
  await query(`INSERT INTO squad_memberships(squad_id,user_id,status) SELECT $1,id,'active' FROM users WHERE id=ANY($2::bigint[])`, [squadId, users.map(user => user.id)]);
}

async function phase5Pending(user, maxMembers, idempotencyKey, createdAt = null) {
  const { query } = require('../src/db/pool');
  return query(`INSERT INTO squad_membership_purchase_requests (user_id,idempotency_key,min_members,max_members,price,status,created_at) VALUES($1,$2,$3,$4,$5,'pending',COALESCE($6,NOW())) RETURNING id`, [user.id, idempotencyKey, 11, maxMembers, 200, createdAt]);
}

test('Phase 5: existing-Squad event settles FIFO pending requests only on that Squad', phase5Integration, async () => {
  const { query } = require('../src/db/pool');
  const walletService = require('../src/services/wallet-service');
  const { acceptInvitation } = require('../src/services/squad-membership-service');
  const tag = phase5Suffix();
  const users = [];
  const squads = [];
  const previousBotToken = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = '';
  try {
    for (let i = 1; i <= 14; i += 1) users.push(await phase5CreateUser(walletService, tag, i));
    const squad = await query('INSERT INTO squads(owner_user_id) VALUES($1) RETURNING id', [users[0].id]);
    squads.push(squad.rows[0].id);
    await phase5AddActiveMembers(squads[0], users.slice(0, 10));
    const unrelated = await query('INSERT INTO squads(owner_user_id) VALUES($1) RETURNING id', [users[10].id]);
    squads.push(unrelated.rows[0].id);
    await phase5AddActiveMembers(squads[1], [users[10]]);
    await phase5Pending(users[12], 20, 'fifo-old', '2026-01-01T00:00:00Z');
    await phase5Pending(users[13], 20, 'fifo-new', '2026-01-02T00:00:00Z');
    const invitation = await query(`INSERT INTO squad_invitations(squad_id,inviter_user_id,invitee_user_id) VALUES($1,$2,$3) RETURNING id`, [squads[0], users[0].id, users[11].id]);
    await acceptInvitation({ invitationId: invitation.rows[0].id, inviteeUserId: users[11].id });
    const requests = await query(`SELECT user_id,status FROM squad_membership_purchase_requests WHERE user_id=ANY($1::bigint[]) ORDER BY created_at,id`, [[users[12].id, users[13].id]]);
    assert.deepEqual(requests.rows.map(row => [String(row.user_id), row.status]), [[String(users[12].id), 'settled'], [String(users[13].id), 'settled']]);
    assert.equal((await query('SELECT COUNT(*)::int AS count FROM squad_memberships WHERE squad_id=$1 AND user_id=ANY($2::bigint[])', [squads[0], [users[12].id, users[13].id]])).rows[0].count, 2);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM squad_memberships WHERE squad_id=$1 AND status IN ('active','inactive','suspended')", [squads[1]])).rows[0].count, 1);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=ANY($1::bigint[]) AND transaction_type='SQUAD_MEMBERSHIP_PURCHASE'", [[users[12].id, users[13].id]])).rows[0].count, 2);
  } finally { process.env.BOT_TOKEN = previousBotToken; await phase5Cleanup({ users, squads }); }
});

test('Phase 5: remaining capacity is a hard bound for one settlement pass', phase5Integration, async () => {
  const { query } = require('../src/db/pool');
  const walletService = require('../src/services/wallet-service');
  const { acceptInvitation } = require('../src/services/squad-membership-service');
  const tag = phase5Suffix();
  const users = [];
  const squads = [];
  const previousBotToken = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = '';
  try {
    for (let i = 1; i <= 23; i += 1) users.push(await phase5CreateUser(walletService, tag, i));
    const squad = await query('INSERT INTO squads(owner_user_id) VALUES($1) RETURNING id', [users[0].id]);
    squads.push(squad.rows[0].id);
    await phase5AddActiveMembers(squads[0], users.slice(0, 19));
    await phase5Pending(users[20], 20, 'bounded-1'); await phase5Pending(users[21], 20, 'bounded-2'); await phase5Pending(users[22], 20, 'bounded-3');
    const invitation = await query(`INSERT INTO squad_invitations(squad_id,inviter_user_id,invitee_user_id) VALUES($1,$2,$3) RETURNING id`, [squads[0], users[0].id, users[19].id]);
    await acceptInvitation({ invitationId: invitation.rows[0].id, inviteeUserId: users[19].id });
    const requests = await query(`SELECT status FROM squad_membership_purchase_requests WHERE user_id=ANY($1::bigint[]) ORDER BY id`, [[users[20].id, users[21].id, users[22].id]]);
    assert.deepEqual(requests.rows.map(row => row.status), ['pending', 'pending', 'pending']);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM squad_memberships WHERE squad_id=$1 AND status IN ('active','inactive','suspended')", [squads[0]])).rows[0].count, 20);
  } finally { process.env.BOT_TOKEN = previousBotToken; await phase5Cleanup({ users, squads }); }
});

test('Phase 5: notification failure does not invalidate committed settlement', phase5Integration, async () => {
  const { query } = require('../src/db/pool');
  const walletService = require('../src/services/wallet-service');
  const { acceptInvitation } = require('../src/services/squad-membership-service');
  const tag = phase5Suffix();
  const users = [];
  const squads = [];
  const previousBotToken = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = '';
  try {
    for (let i = 1; i <= 12; i += 1) users.push(await phase5CreateUser(walletService, tag, i));
    const squad = await query('INSERT INTO squads(owner_user_id) VALUES($1) RETURNING id', [users[0].id]);
    squads.push(squad.rows[0].id);
    await phase5AddActiveMembers(squads[0], users.slice(0, 10));
    await phase5Pending(users[11], 20, 'notify-failure');
    const invitation = await query(`INSERT INTO squad_invitations(squad_id,inviter_user_id,invitee_user_id) VALUES($1,$2,$3) RETURNING id`, [squads[0], users[0].id, users[10].id]);
    await acceptInvitation({ invitationId: invitation.rows[0].id, inviteeUserId: users[10].id });
    assert.equal((await query('SELECT status FROM squad_membership_purchase_requests WHERE user_id=$1', [users[11].id])).rows[0].status, 'settled');
    assert.equal((await query('SELECT status FROM squad_memberships WHERE user_id=$1 AND squad_id=$2', [users[11].id, squads[0]])).rows[0].status, 'inactive');
  } finally { process.env.BOT_TOKEN = previousBotToken; await phase5Cleanup({ users, squads }); }
});
