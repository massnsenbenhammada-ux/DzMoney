const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

test('admin squad exposes locked contract settings and challenge controls', () => {
  const route = read('src/http/admin-squad-challenge-routes.js');
  const service = read('src/services/admin-squad-service.js');
  assert.match(route, /adminAuth/);
  assert.match(route, /createRateLimit/);
  assert.match(route, /challenges/);
  assert.match(service, /squad\.membership_tiers/);
  assert.match(service, /squad\.daily_target_dzp_per_member/);
  assert.match(service, /squad\.daily_verified_ad_target/);
});

test('admin squad uses canonical settings and audit log', () => {
  const service = read('src/services/admin-squad-service.js');
  assert.match(service, /admin_settings/);
  assert.match(service, /admin_audit_log/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /actorTelegramUserId/);
});

test('admin UI exposes Squad controls without obsolete hierarchy', () => {
  const html = read('public/admin.html');
  const js = read('public/admin.js');
  assert.match(html, /squadSection/);
  assert.match(html, /squadMembershipTiers/);
  assert.match(html, /squadDailyTarget/);
  assert.match(html, /squadVerifiedAdTarget/);
  assert.match(html, /squadModifierMapping/);
  assert.match(js, /\/api\/admin\/squad/);
  assert.doesNotMatch(html, /10-level|hierarchical/i);
});

test('test:all includes admin squad contract', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['test:admin-squad'],
    'node ./scripts/test-admin-squad.js',
  );
  assert.match(packageJson.scripts['test:all'], /test:admin-squad/);
});

console.log('Admin Squad contract tests passed.');
