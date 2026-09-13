const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
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

async function purchaseLedgerCount(userId) {
  const result = await query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id = $1 AND transaction_type = 'SQUAD_MEMBERSHIP_PURCHASE'", [userId]);
  return Number(result.rows[0].count);
}

function telegramInitData(telegramUserId) {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify({ id: Number(telegramUserId), first_name: 'Phase4', username: `phase4_${telegramUserId}` }) });
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

const phase4Test = { skip: !process.env.DATABASE_URL };

test('Phase 4: affordability, zero-charge pending, first-two settlement, owner, third join, and idempotency', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squads = [];
  try {
    for (let i = 1; i <= 3; i += 1) users.push(await createUser(suffix, i, 100));
    const first = await purchasePaidMembership({ userId: users[0].id, maxMembers: 10, idempotencyKey: 'first' });
    assert.equal(first.status, 'pending');
    assert.equal(await dzpBalance(users[0].id), 100);
    assert.equal((await query('SELECT COUNT(*)::int AS count FROM squad_membership_purchase_requests WHERE user_id=$1 AND status=\'pending\'', [users[0].id])).rows[0].count, 1);

    const second = await purchasePaidMembership({ userId: users[1].id, maxMembers: 10, idempotencyKey: 'second' });
    assert.equal(second.status, 'settled');
    assert.equal(String(second.ownerUserId), String(users[0].id));
    assert.equal(await dzpBalance(users[0].id), 0);
    assert.equal(await dzpBalance(users[1].id), 0);
    const squad = await query('SELECT id FROM squads WHERE owner_user_id=$1 ORDER BY id DESC LIMIT 1', [users[0].id]);
    squads.push(squad.rows[0].id);

    const third = await purchasePaidMembership({ userId: users[2].id, maxMembers: 10, idempotencyKey: 'third' });
    assert.equal(third.status, 'settled');
    assert.equal(String(third.membership.squad_id), String(squads[0]));
    const repeat = await purchasePaidMembership({ userId: users[2].id, maxMembers: 10, idempotencyKey: 'third' });
    assert.equal(repeat.duplicate, true);
    assert.equal(await purchaseLedgerCount(users[2].id), 1);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM squad_memberships WHERE squad_id=$1 AND status <> 'cancelled'", [squads[0]])).rows[0].count, 3);
  } finally { await cleanup({ userIds: users.map(user => user.id), squadIds: squads }); }
});

test('Phase 4: insufficient DZP rejects with no pending request and no Ledger mutation', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await createUser(suffix, 1, 99);
  try {
    await assert.rejects(() => purchasePaidMembership({ userId: user.id, maxMembers: 10, idempotencyKey: 'insufficient' }), /Insufficient DZP balance/);
    assert.equal(await dzpBalance(user.id), 99);
    assert.equal((await query('SELECT COUNT(*)::int AS count FROM squad_membership_purchase_requests WHERE user_id=$1', [user.id])).rows[0].count, 0);
    assert.equal(await purchaseLedgerCount(user.id), 0);
  } finally { await cleanup({ userIds: [user.id] }); }
});

test('Phase 4: eligible-Squad-first priority beats an older pending request', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squads = [];
  try {
    for (let i = 1; i <= 4; i += 1) users.push(await createUser(suffix, i, 100));
    await purchasePaidMembership({ userId: users[0].id, maxMembers: 10, idempotencyKey: 'older-pending' });
    const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[1].id]);
    squads.push(squad.rows[0].id);
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active')", [squads[0], users[1].id, users[2].id]);
    const result = await purchasePaidMembership({ userId: users[3].id, maxMembers: 10, idempotencyKey: 'eligible-wins' });
    assert.equal(result.status, 'settled');
    assert.equal(String(result.membership.squad_id), String(squads[0]));
    assert.equal((await query("SELECT status FROM squad_membership_purchase_requests WHERE user_id=$1", [users[0].id])).rows[0].status, 'pending');
    assert.equal(await purchaseLedgerCount(users[0].id), 0);
  } finally { await cleanup({ userIds: users.map(user => user.id), squadIds: squads }); }
});

test('Phase 4: smallest eligible Squad uses deterministic id tie-break', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squads = [];
  try {
    for (let i = 1; i <= 6; i += 1) users.push(await createUser(suffix, i, i === 6 ? 100 : 0));
    const first = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[0].id]);
    const second = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [users[1].id]);
    squads.push(first.rows[0].id, second.rows[0].id);
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) VALUES ($1,$2,'active'),($1,$3,'active'),($2,$4,'active'),($2,$5,'active')", [squads[0], users[0].id, users[1].id, users[2].id, users[3].id]);
    const result = await purchasePaidMembership({ userId: users[5].id, maxMembers: 10, idempotencyKey: 'smallest' });
    assert.equal(String(result.membership.squad_id), String(Math.min(...squads)));
  } finally { await cleanup({ userIds: users.map(user => user.id), squadIds: squads }); }
});

test('Phase 4: concurrent first/second/third requests produce one Squad and exactly one charge per user', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squads = [];
  try {
    for (let i = 1; i <= 3; i += 1) users.push(await createUser(suffix, i, 100));
    const results = await Promise.all(users.map((user, index) => purchasePaidMembership({ userId: user.id, maxMembers: 10, idempotencyKey: `concurrent-${index}` })));
    assert.equal(results.filter(result => result.status === 'pending').length, 1);
    assert.equal(results.filter(result => result.status === 'settled').length, 2);
    const rows = await query("SELECT DISTINCT squad_id FROM squad_memberships WHERE user_id = ANY($1::bigint[]) AND status <> 'cancelled'", [[users[0].id, users[1].id, users[2].id]]);
    assert.equal(rows.rows.length, 1);
    squads.push(rows.rows[0].squad_id);
    for (const user of users) {
      assert.equal(await dzpBalance(user.id), 0);
      assert.equal(await purchaseLedgerCount(user.id), 1);
    }
  } finally { await cleanup({ userIds: users.map(user => user.id), squadIds: squads }); }
});

test('Phase 4: T10 accepts a real Squad with 1001 live members', phase4Test, async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const users = [];
  const squads = [];
  try {
    const owner = await createUser(suffix, 't10owner', 0);
    const purchaser = await createUser(suffix, 't10buyer', 10000);
    users.push(owner, purchaser);
    const bulk = await query(`INSERT INTO users (telegram_user_id,username,first_name) SELECT ('8' || $1 || gs)::bigint,'squad_t10_member_' || gs,'T10' FROM generate_series(1,1000) AS gs RETURNING id`, [suffix]);
    users.push(...bulk.rows.map(row => ({ id: row.id })));
    const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [owner.id]);
    squads.push(squad.rows[0].id);
    await query("INSERT INTO squad_memberships (squad_id,user_id,status) SELECT $1,$2,'active' UNION ALL SELECT $1,id,'active' FROM users WHERE id=ANY($3::bigint[])", [squads[0], owner.id, bulk.rows.map(row => row.id)]);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM squad_memberships WHERE squad_id=$1 AND status <> 'cancelled'", [squads[0]])).rows[0].count, 1001);
    const result = await purchasePaidMembership({ userId: purchaser.id, maxMembers: null, idempotencyKey: 't10' });
    assert.equal(result.status, 'settled');
    assert.equal(result.tier.maxMembers, null);
    assert.equal(String(result.membership.squad_id), String(squads[0]));
  } finally { await cleanup({ userIds: users.map(user => user.id), squadIds: squads }); }
});

test('Phase 4: rollback removes charges, Ledger, new Squad, and memberships while preserving the original pending request', phase4Test, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const users = [];
  const squads = [];
  const triggerName = `phase4_rb_${Date.now()}`;
  const functionName = `${triggerName}_fn`;
  try {
    users.push(await createUser(suffix, 1, 100), await createUser(suffix, 2, 100));
    await purchasePaidMembership({ userId: users[0].id, maxMembers: 10, idempotencyKey: 'rollback-first' });
    await query(`CREATE FUNCTION ${functionName}() RETURNS trigger AS $body$ BEGIN IF NEW.user_id=${Number(users[1].id)} THEN RAISE EXCEPTION 'Phase 4 rollback test'; END IF; RETURN NEW; END; $body$ LANGUAGE plpgsql`);
    await query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON squad_memberships FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    await assert.rejects(() => purchasePaidMembership({ userId: users[1].id, maxMembers: 10, idempotencyKey: 'rollback-second' }), /Phase 4 rollback test/);
    assert.equal(await dzpBalance(users[0].id), 100);
    assert.equal(await dzpBalance(users[1].id), 100);
    assert.equal(await purchaseLedgerCount(users[0].id), 0);
    assert.equal(await purchaseLedgerCount(users[1].id), 0);
    assert.equal((await query('SELECT COUNT(*)::int AS count FROM squads WHERE owner_user_id=$1', [users[0].id])).rows[0].count, 0);
    assert.equal((await query("SELECT status FROM squad_membership_purchase_requests WHERE user_id=$1", [users[0].id])).rows[0].status, 'pending');
  } finally {
    await query(`DROP TRIGGER IF EXISTS ${triggerName} ON squad_memberships`).catch(() => {});
    await query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
    await cleanup({ userIds: users.map(user => user.id), squadIds: squads });
  }
});

test('Phase 4: pending state survives HTTP refresh/reopen through /api/squad', phase4Test, async () => {
  const previousBotToken = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'phase4-http-test-bot-token';
  const telegramId = String(700000000 + (Date.now() % 1000000));
  const user = await walletService.createUser({ telegramUserId: telegramId, username: `squad_phase4_http_${Date.now()}` });
  await query("UPDATE wallet_accounts SET balance=100 WHERE user_id=$1 AND currency='DZP'", [user.id]);
  let server;
  try {
    const app = require('../server');
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const port = server.address().port;
    const initData = telegramInitData(telegramId);
    const purchase = await fetch(`http://127.0.0.1:${port}/api/squad/membership/purchase`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ maxMembers: 10, idempotencyKey: 'http-pending' }) });
    assert.equal(purchase.status, 202);
    const purchaseBody = await purchase.json();
    const reopen = await fetch(`http://127.0.0.1:${port}/api/squad`, { headers: { 'X-Telegram-Init-Data': initData } });
    assert.equal(reopen.status, 200);
    const reopenBody = await reopen.json();
    assert.equal(reopenBody.squad, null);
    assert.equal(reopenBody.pendingMembership.status, 'pending');
    assert.equal(String(reopenBody.pendingMembership.id), String(purchaseBody.pendingMembership.id));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (previousBotToken === undefined) delete process.env.BOT_TOKEN; else process.env.BOT_TOKEN = previousBotToken;
    await cleanup({ userIds: [user.id] });
  }
});

pool.on('error', () => {});
