const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const { pool } = require('../src/db/pool');

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const telegramUserId = `8${suffix}`;

  const created = await walletService.createUser({ telegramUserId });
  assert.match(created.referral_code, /^[A-Z0-9]{10}$/);

  const reopened = await walletService.createUser({ telegramUserId });
  assert.strictEqual(reopened.referral_code, created.referral_code);

  const result = await pool.query(
    'SELECT COUNT(*)::integer AS count FROM users WHERE referral_code = $1',
    [created.referral_code]
  );
  assert.strictEqual(Number(result.rows[0].count), 1);

  console.log('Referral bootstrap foundation invariants: PASS');
}

main()
  .catch(error => {
    console.error('Referral bootstrap foundation invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
