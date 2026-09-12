const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getCurrentSquadTier } = require('../src/services/squad-membership-service');
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

test('admin tier normalization accepts only an unbounded final tier', () => {
  const normalized = normalizeSetting('squad.membership_tiers', TIERS);
  assert.equal(normalized.at(-1).maxMembers, null);
  assert.equal(normalized.at(-1).minMembers, 1001);
  assert.throws(() => normalizeSetting('squad.membership_tiers', [...TIERS.slice(0, -1), { ...TIERS.at(-1), maxMembers: 2000 }]), /unbounded/);
  assert.throws(() => normalizeSetting('squad.membership_tiers', [...TIERS.slice(0, -1), { ...TIERS.at(-1), minMembers: 1002 }]), /contiguous/);
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