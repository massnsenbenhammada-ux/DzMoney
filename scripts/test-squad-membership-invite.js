const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.match(membership, /status <> 'cancelled'/);
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

test('squad API exposes read, pending invitations, invite and accept without a leave endpoint', () => {
  assert.match(routes, /router\.get\('\/invitations'/);
  assert.match(routes, /router\.post\('\/invitations'/);
  assert.match(routes, /router\.post\('\/invitations\/:id\/accept'/);
  assert.doesNotMatch(routes, /router\.post\('\/leave'/);
});

test('frontend consumes the invitation API and never decides membership activation', () => {
  assert.match(frontend, /\/api\/squad\/invitations/);
  assert.match(frontend, /\/accept/);
  assert.doesNotMatch(frontend, /status\s*=\s*['"]active['"]/);
  assert.doesNotMatch(frontend, /reward/i);
});
