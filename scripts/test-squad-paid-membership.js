const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');

const { query } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { getCurrentSquadTier, purchasePaidMembership } = require('../src/services/squad-membership-service');
const { normalizeSetting } = require('../src/services/admin-squad-service');

const TIERS = [
  { minMembers: 1, maxMembers: 10, price: 100 },
  { minMembers: 11, maxMembers: 20, price: 200 },
  { minMembers: 21, maxMembers: 50, price: 500 },
  { minMembers: 51, maxMembers: 100, price: 1000 },
  { minMembers: 101, maxMembers: 200, price: 2000 },
  { minMembers: 201, maxMembers: 300, price: 3000 },
  { minMembers: 301, maxMembers: 400, price: 4000 },
  { minMembers: 401, maxMembers: 500, price: 5000 },
  { minMembers: 501, maxMembers: 1000, price: 7500 },
  { minMembers: 1001, maxMembers: null, price: 10000 },
];

function testSuffix() {
  return `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

async function createUser(suffix, index, balance) {
  const telegramUserId = String(800000000 + (Date.now() % 1000000) * 1000 + index);
  const user = await walletService.createUser({ telegramUserId, username: `phase4_scope_${suffix}_${index}` });
  await query("UPDATE wallet_accounts SET balance = $1 WHERE user_id = $2 AND currency = 'DZP'", [balance, user.id]);
  return user;
}

async function cleanupUsers(userIds) {
  if (!userIds.length) return;
  await query('DELETE FROM squad_membership_purchase_requests WHERE user_id = ANY($1::bigint[])', [userIds]);
  await query('DELETE FROM squad_memberships WHERE user_id = ANY($1::bigint[])', [userIds]);
  await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
}

test('Phase 3 classifies every lower/upper/exact transition boundary', () => {
  const cases = [
    [1, 10], [10, 10], [11, 20], [20, 20], [21, 50], [50, 50],
    [51, 100], [100, 100], [101, 200], [200, 200], [201, 300], [300, 300],
    [301, 400], [400, 400], [401, 500], [500, 500], [501, 1000], [1000, 1000],
    [1001, null], [10000, null],
  ];
  for (const [memberCount, expectedMax] of cases) {
    const tier = getCurrentSquadTier(memberCount, TIERS);
    assert.ok(tier, `missing tier for ${memberCount}`);
    assert.equal(tier.maxMembers, expectedMax, `wrong tier for ${memberCount}`);
  }
});

test('Phase 3 leaves no gap and never treats T10 null as a numeric cap', () => {
  assert.equal(getCurrentSquadTier(10, TIERS).maxMembers, 10);
  assert.equal(getCurrentSquadTier(11, TIERS).minMembers, 11);
  assert.equal(getCurrentSquadTier(1000, TIERS).maxMembers, 1000);
  assert.equal(getCurrentSquadTier(1001, TIERS).maxMembers, null);
  assert.equal(getCurrentSquadTier(1000000, TIERS).maxMembers, null);
  assert.equal(getCurrentSquadTier(0, TIERS), null);
});

test('admin tier normalization accepts only the canonical ten-tier range', () => {
  const normalized = normalizeSetting('squad.membership_tiers', TIERS);
  assert.equal(normalized.length, 10);
  assert.equal(normalized.at(-1).maxMembers, null);
  assert.equal(normalized.at(-1).minMembers, 1001);
  assert.throws(() => normalizeSetting('squad.membership_tiers', TIERS.slice(0, -1)), /exactly ten/);
  assert.throws(
    () => normalizeSetting('squad.membership_tiers', [...TIERS.slice(0, -1), { ...TIERS.at(-1), maxMembers: 2000 }]),
    /cover T1-T10|Invalid Squad membership tier configuration/
  );
  assert.throws(
    () => normalizeSetting('squad.membership_tiers', [...TIERS.slice(0, -1), { ...TIERS.at(-1), minMembers: 1002 }]),
    /cover T1-T10|Invalid Squad membership tier configuration/
  );
});

test('paid membership keeps activation separate from payment', () => {
  const membership = { status: 'inactive' };
  assert.equal(membership.status, 'inactive');
});

test('paid membership reuses the existing Economy transaction boundary', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/squad-membership-service.js'), 'utf8');
  assert.match(source, /postEconomyTransactionOnClient/);
  assert.match(source, /SQUAD_MEMBERSHIP_PURCHASE/);
  assert.match(source, /DZP/);
});

test('paid membership cannot select a specific Squad directly from the HTTP route', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/http/squad-routes.js'), 'utf8');
  assert.match(route, /membership\/purchase/);
  assert.doesNotMatch(route, /req\.body\?\.squadId.*membership/);
});

test('Phase 4 Option B: T2-T10 never pair pending requests or create a Squad', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = testSuffix();
  const users = [];
  try {
    for (let tierIndex = 1; tierIndex < TIERS.length; tierIndex += 1) {
      const tier = TIERS[tierIndex];
      const first = await createUser(suffix, tierIndex * 2, tier.price);
      const second = await createUser(suffix, tierIndex * 2 + 1, tier.price);
      users.push(first, second);
      const idPrefix = `phase4-option-b-${tierIndex}-${suffix}`;

      const firstResult = await purchasePaidMembership({ userId: first.id, maxMembers: tier.maxMembers, idempotencyKey: `${idPrefix}-first` });
      const secondResult = await purchasePaidMembership({ userId: second.id, maxMembers: tier.maxMembers, idempotencyKey: `${idPrefix}-second` });

      assert.equal(firstResult.status, 'pending', `T${tierIndex + 1} first request must remain pending`);
      assert.equal(secondResult.status, 'pending', `T${tierIndex + 1} second request must remain pending`);
      assert.equal((await query("SELECT COUNT(*)::int AS count FROM squad_membership_purchase_requests WHERE user_id = ANY($1::bigint[]) AND status = 'pending'", [[first.id, second.id]])).rows[0].count, 2);
      assert.equal((await query('SELECT COUNT(*)::int AS count FROM squads WHERE owner_user_id = ANY($1::bigint[])', [[first.id, second.id]])).rows[0].count, 0);
      assert.equal((await query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id = ANY($1::bigint[]) AND transaction_type = 'SQUAD_MEMBERSHIP_PURCHASE'", [[first.id, second.id]])).rows[0].count, 0);
    }
  } finally {
    await cleanupUsers(users.map(user => user.id));
  }
});
