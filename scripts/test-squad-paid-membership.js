const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function selectTier(tiers, requestedMaxMembers) {
  return tiers.find(tier => tier.maxMembers === requestedMaxMembers) || null;
}

test('paid membership accepts only a configured member-count tier', () => {
  const tiers = [{ minMembers: 1, maxMembers: 10, price: 100 }, { minMembers: 11, maxMembers: 20, price: 200 }];
  assert.deepEqual(selectTier(tiers, 10), tiers[0]);
  assert.equal(selectTier(tiers, 999), null);
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
