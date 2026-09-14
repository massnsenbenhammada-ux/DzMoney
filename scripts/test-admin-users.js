const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const { adjustBalance } = require('../src/services/admin-user-service');

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
  assert.doesNotMatch(service, /dzpSource is required for DZP adjustments/);
});

test('Admin DZP grants are not reclassified into activity/conversion/purchase buckets', () => {
  const service = read('src/services/admin-user-service.js');
  assert.doesNotMatch(service, /DZP_BUCKETS/);
  assert.doesNotMatch(service, /dzpBucket:\s*dzpSource/);
  assert.match(service, /source: 'admin_adjustment'/);
});

test('DZP source buckets remain provenance fields rather than a spendability invariant', () => {
  const migration = read('migrations/051_admin_grants_are_unbucketed.sql');
  assert.match(migration, /DROP CONSTRAINT IF EXISTS wallet_accounts_dzp_sources_not_abOVE_balance/i);
  const reconcile = read('scripts/reconcile-economy.js');
  assert.doesNotMatch(reconcile, /dzp_source_mismatches/);
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

async function integrationTest() {
  const marker = `admin-grant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user;
  try {
    user = await createUser({ telegramUserId: -Date.now(), username: marker, firstName: 'Admin Grant Test' });
    const actor = '999999999';
    const grants = [
      ['COIN', '10'],
      ['DZX', '20'],
      ['DZP', '30'],
    ];

    for (const [currency, amount] of grants) {
      const key = `${marker}:${currency}:grant`;
      const first = await adjustBalance({ userId: user.id, currency, amount, reason: `Admin grant ${currency}`, idempotencyKey: key, actorTelegramUserId: actor });
      assert.equal(first.duplicate, false);
      const duplicate = await adjustBalance({ userId: user.id, currency, amount, reason: `Admin grant ${currency}`, idempotencyKey: key, actorTelegramUserId: actor });
      assert.equal(duplicate.duplicate, true);
    }

    let wallets = await getUserWallets(user.id);
    const byCurrency = Object.fromEntries(wallets.map(wallet => [wallet.currency, wallet]));
    assert.equal(Number(byCurrency.COIN.balance), 10);
    assert.equal(Number(byCurrency.DZX.balance), 20);
    assert.equal(Number(byCurrency.DZP.balance), 30);
    assert.equal(Number(byCurrency.DZP.earned_dzp), 0);
    assert.equal(Number(byCurrency.DZP.converted_dzp), 0);
    assert.equal(Number(byCurrency.DZP.purchased_dzp), 0);

    await postEconomyTransaction({
      idempotencyKey: `${marker}:dzp-consume`,
      userId: user.id,
      type: 'TEST_DZP_CONSUMPTION',
      metadata: { source: 'admin_grant_consumption_test' },
      movements: [{ currency: 'DZP', amount: -10, source: 'test_consumption' }],
    });

    wallets = await getUserWallets(user.id);
    assert.equal(Number(wallets.find(wallet => wallet.currency === 'DZP').balance), 20);

    const debit = await adjustBalance({ userId: user.id, currency: 'DZP', amount: '-5', reason: 'Admin correction', idempotencyKey: `${marker}:DZP:debit`, actorTelegramUserId: actor });
    assert.equal(debit.duplicate, false);
    wallets = await getUserWallets(user.id);
    assert.equal(Number(wallets.find(wallet => wallet.currency === 'DZP').balance), 15);

    const ledger = await query(
      `SELECT lt.transaction_type, le.currency, le.amount, le.source, lt.metadata
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.user_id = $1
       ORDER BY le.id`,
      [user.id]
    );
    const adminEntries = ledger.rows.filter(row => row.transaction_type === 'ADMIN_BALANCE_ADJUSTMENT');
    assert.equal(adminEntries.length, 4);
    assert.ok(adminEntries.every(row => row.source === 'admin_adjustment'));
    assert.ok(adminEntries.every(row => row.metadata.actor_telegram_user_id === actor));

    const negative = await query(
      `SELECT COUNT(*)::int AS count
       FROM wallet_accounts
       WHERE user_id = $1
         AND (balance < 0 OR earned_dzp < 0 OR converted_dzp < 0 OR purchased_dzp < 0)`,
      [user.id]
    );
    assert.equal(Number(negative.rows[0].count), 0);

    console.log('Admin grant integration across COIN/DZX/DZP: PASS');
  } finally {
    if (user) {
      await withTransaction(async client => {
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)', [user.id]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM users WHERE id = $1', [user.id]);
      });
    }
    await pool.end();
  }
}

integrationTest().catch(error => {
  console.error('Admin grant integration: FAIL');
  console.error(error);
  process.exit(1);
});

console.log('Admin users contract tests passed.');
