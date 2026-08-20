const assert = require('node:assert/strict');
const { query, withTransaction } = require('../src/db/pool');
const { createUser, getUserWallets } = require('../src/services/wallet-service');

async function main() {
  const marker = `core-test-${Date.now()}`;

  const db = await query('SELECT current_database() AS database, NOW() AS server_time');
  assert.equal(db.rowCount, 1);

  const user = await createUser({
    telegramUserId: -Math.floor(Date.now() / 1000),
    username: marker,
    firstName: 'Core Test'
  });

  const wallets = await getUserWallets(user.id);
  assert.deepEqual(wallets.map(w => w.currency).sort(), ['COIN', 'DZX', 'DZP', 'TON']);
  assert.ok(wallets.every(w => Number(w.balance) === 0));

  const migration = await query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.ok(migration.rows.some(r => r.filename === '001_core.sql'));

  await withTransaction(async client => {
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
  });

  console.log('Core tests: PASS');
}

main().catch(error => {
  console.error('Core tests: FAIL');
  console.error(error);
  process.exit(1);
});
