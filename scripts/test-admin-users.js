const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

test('admin users route reuses adminAuth and rate limiting', () => {
  const route = read('src/http/admin-user-routes.js');
  assert.match(route, /require\(["']\.\/admin-auth["']\)/);
  assert.match(route, /router\.use\(adminAuth\)/);
  assert.match(route, /createRateLimit/);
});

test('admin users service reads canonical users, wallets and ledger', () => {
  const service = read('src/services/admin-user-service.js');
  assert.match(service, /FROM users/);
  assert.match(service, /FROM wallet_accounts/);
  assert.match(service, /FROM ledger_entries/);
  assert.match(service, /earned_dzp/);
  assert.match(service, /converted_dzp/);
  assert.match(service, /purchased_dzp/);
});

test('manual adjustment uses the canonical Economy transaction path', () => {
  const service = read('src/services/admin-user-service.js');
  assert.match(service, /postEconomyTransaction/);
  assert.match(service, /ADMIN_BALANCE_ADJUSTMENT/);
  assert.match(service, /idempotencyKey/);
  assert.match(service, /reason/);
  assert.match(service, /actorTelegramUserId/);
});

test('manual DZP adjustment preserves source buckets', () => {
  const economy = read('src/services/economy-service.js');
  assert.match(economy, /dzpBucket/);
  assert.match(economy, /earned_dzp/);
  assert.match(economy, /converted_dzp/);
  assert.match(economy, /purchased_dzp/);
});

test('server mounts the admin users router', () => {
  const server = read('server.js');
  assert.match(server, /createAdminUserRouter/);
  assert.match(server, /\/api\/admin\/users/);
});

test('admin UI exposes search, profile and balance adjustment controls', () => {
  const html = read('public/admin.html');
  const js = read('public/admin.js');
  assert.match(html, /usersSection/);
  assert.match(html, /adminUserSearch/);
  assert.match(html, /adminUserProfile/);
  assert.match(js, /id="adminBalanceAdjustment"/);
  assert.match(js, /\/api\/admin\/users/);
  assert.match(js, /idempotencyKey/);
  assert.match(js, /Mandatory reason/);
});

test('test:all includes admin users contract', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['test:admin-users'], 'node ./scripts/test-admin-users.js');
  assert.match(packageJson.scripts['test:all'], /test:admin-users/);
});

console.log('Admin users contract tests passed.');
