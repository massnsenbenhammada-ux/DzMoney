const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('admin referral route reuses adminAuth and rate limiting', () => {
  const route = read('src/http/admin-referral-routes.js');
  assert.match(route, /require\('\.\/admin-auth'\)/);
  assert.match(route, /router\.use\(adminAuth\)/);
  assert.match(route, /createRateLimit/);
});

test('admin referral settings use the existing admin_settings source', () => {
  const service = read('src/services/admin-referral-service.js');
  assert.match(service, /admin_settings/);
  assert.match(service, /referral\.reward_coin/);
  assert.match(service, /referral\.reward_dzx/);
  assert.match(service, /referral\.reward_dzp/);
  assert.match(service, /referral\.lifetime_percent/);
  assert.match(service, /admin_audit_log/);
});

test('runtime referral rewards read admin-configured values', () => {
  const service = read('src/services/referral-service.js');
  assert.match(service, /admin_settings/);
  assert.match(service, /referral\.reward_coin/);
  assert.match(service, /referral\.reward_dzx/);
  assert.match(service, /referral\.reward_dzp/);
  assert.match(service, /referral\.lifetime_percent/);
  assert.doesNotMatch(service, /const REFERRAL_LIFETIME_RATE = 0\.2/);
});

test('server mounts the admin referral router', () => {
  const server = read('server.js');
  assert.match(server, /createAdminReferralRouter/);
  assert.match(server, /\/api\/admin\/referral/);
});

test('admin UI exposes referral qualification and reward controls', () => {
  const html = read('public/admin.html');
  const js = read('public/admin.js');
  assert.match(html, /referralSection/);
  assert.match(html, /referralQualification/);
  assert.match(html, /referralActivation/);
  assert.match(html, /referralLifetime/);
  assert.match(js, /\/api\/admin\/referral/);
});

test('test:all includes admin referral contract', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['test:admin-referral'], 'node ./scripts/test-admin-referral.js');
  assert.match(packageJson.scripts['test:all'], /test:admin-referral/);
});

console.log('Admin referral contract tests passed.');
