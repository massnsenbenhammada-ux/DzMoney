const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const service = fs.readFileSync(path.join(__dirname, '../src/services/squad-membership-service.js'), 'utf8');

test('switch uses a separate service function and preserves membership status', () => {
  assert.match(service, /async function switchSquadWithinTier\(\{ userId, idempotencyKey \}\)/);
  assert.match(service, /UPDATE squad_memberships SET squad_id = \$1 WHERE id = \$2 RETURNING/);
  assert.match(service, /membershipResponse\(membership\.rows\[0\]\)/);
});

test('switch excludes the current Squad and locks the selected target', () => {
  assert.match(service, /selectEligibleSquad\(client, snapshot\.tier, current\.squad_id\)/);
  assert.match(service, /FOR UPDATE SKIP LOCKED/);
  assert.match(service, /new_squad_id: target\.id/);
});

test('switch tax reads the canonical DZX-per-DZP setting and deducts DZX only', () => {
  assert.match(service, /economy\.dzx_per_dzp/);
  assert.match(service, /type: 'SQUAD_MEMBERSHIP_SWITCH'/);
  assert.match(service, /currency: 'DZX', amount: `-\$\{taxDzx\}`/);
  assert.doesNotMatch(service, /tax.*10.*DZX.*1.*DZP/);
});

test('upgrade requires a strictly higher configured tier and burns the full new price in DZP', () => {
  assert.match(service, /async function upgradeSquadTier\(\{ userId, newMaxMembers, idempotencyKey \}\)/);
  assert.match(service, /tier\.maxMembers <= snapshot\.tier\.maxMembers/);
  assert.match(service, /type: 'SQUAD_MEMBERSHIP_UPGRADE'/);
  assert.match(service, /currency: 'DZP', amount: -tier\.price/);
  assert.match(service, /status = 'cancelled'/);
});

test('upgrade creates one replacement membership and cancels the old one', () => {
  assert.match(service, /INSERT INTO squad_memberships \(squad_id, user_id, status\) VALUES \(\$1, \$2, 'inactive'\)/);
  assert.match(service, /UPDATE squad_memberships SET status = 'cancelled' WHERE id = \$1/);
});
