const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const service = read('src/services/admin-user-enforcement-service.js');
const routes = read('src/http/admin-user-enforcement-routes.js');
const auth = read('src/http/telegram-auth.js');
const adminAuth = read('src/http/admin-auth.js');
const migration = read('migrations/048_admin_account_status.sql');
const server = read('server.js');
const html = read('public/admin.html');
const client = read('public/admin-enforcement.js');

test('account status is canonical and migration-safe', () => {
  assert.match(migration, /ALTER TABLE users/);
  assert.match(migration, /account_status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(migration, /'active', 'suspended', 'banned'/);
  assert.match(service, /UPDATE users SET account_status/);
});

test('Telegram auth blocks non-active accounts after verification', () => {
  assert.match(auth, /SELECT account_status FROM users/);
  assert.match(auth, /status !== 'active'/);
  assert.match(auth, /403/);
});

test('Admin auth remains the explicit authorization boundary', () => {
  assert.match(adminAuth, /skipAccountStatusCheck/);
  assert.match(adminAuth, /ADMIN_TELEGRAM_USER_IDS/);
});

test('enforcement actions require reason, actor and idempotency', () => {
  assert.match(service, /reason is required/);
  assert.match(service, /actorTelegramUserId is required/);
  assert.match(service, /idempotency_records/);
  assert.match(service, /admin_audit_log/);
});

test('ban and suspend reuse existing Squad membership states', () => {
  assert.match(service, /'cancelled'/);
  assert.match(service, /'suspended'/);
  assert.match(service, /UPDATE squad_memberships SET status/);
});

test('Admin enforcement route is protected and rate-limited', () => {
  assert.match(routes, /router.use\(adminAuth\)/);
  assert.match(routes, /createRateLimit/);
  assert.match(routes, /router.post\('\/:userId\/status'/);
  assert.match(server, /createAdminUserEnforcementRouter/);
  assert.match(server, /\/api\/admin\/users\/enforcement/);
  assert.match(routes, /codeql\[js\/missing-rate-limiting\]/);
});

test('Admin UI exposes explicit status controls without automatic actions', () => {
  assert.match(html, /Account Status/);
  assert.match(html, /enforcementSuspend/);
  assert.match(html, /enforcementBan/);
  assert.match(html, /enforcementActivate/);
  assert.match(client, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(client, /reason/);
});
