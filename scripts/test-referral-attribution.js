const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const { query, pool } = require('../src/db/pool');

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const referrer = await walletService.createUser({ telegramUserId: `900000000${suffix}` });
  const referred = await walletService.createUser({ telegramUserId: `900000001${suffix}` });
  const other = await walletService.createUser({ telegramUserId: `900000002${suffix}` });

  await assert.rejects(
    async () => query(
      `INSERT INTO referral_attributions (referrer_user_id, referred_user_id)
       VALUES ($1, $1)`,
      [referrer.id]
    ),
    /relation "referral_attributions" does not exist/
  );

  console.log('Referral attribution TDD red phase: PASS');
  console.log('The test is expected to fail until the Phase 3 attribution schema exists.');
  void referred;
  void other;
}

main()
  .catch(error => {
    console.error('Referral attribution TDD red phase: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
