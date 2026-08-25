const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const { pool } = require('../src/db/pool');

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const referrer = await walletService.createUser({ telegramUserId: `9${suffix}01` });
  const referred = await walletService.createUser({ telegramUserId: `9${suffix}02` });
  const other = await walletService.createUser({ telegramUserId: `9${suffix}03` });

  await assert.rejects(
    referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referrer.id }),
    /Self referral/
  );

  const first = await referralService.createAttribution({
    referrerUserId: referrer.id,
    referredUserId: referred.id,
  });
  assert.strictEqual(first.duplicate, false);
  assert.strictEqual(Number(first.attribution.referrer_user_id), Number(referrer.id));
  assert.strictEqual(Number(first.attribution.referred_user_id), Number(referred.id));
  assert.strictEqual(first.attribution.status, 'pending');

  const duplicate = await referralService.createAttribution({
    referrerUserId: referrer.id,
    referredUserId: referred.id,
  });
  assert.strictEqual(duplicate.duplicate, true);

  await assert.rejects(
    referralService.createAttribution({
      referrerUserId: other.id,
      referredUserId: referred.id,
    }),
    /already attributed/
  );

  console.log('Referral attribution invariants: PASS');
}

main()
  .catch(error => {
    console.error('Referral attribution invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
