const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const { query, pool } = require('../src/db/pool');

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const referrer = await walletService.createUser({ telegramUserId: `900000000000000${suffix}` });
  const referred = await walletService.createUser({ telegramUserId: `900000000000001${suffix}` });
  const other = await walletService.createUser({ telegramUserId: `900000000000002${suffix}` });

  assert.throws(() => referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referrer.id }), /Self referral/);

  const first = await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referred.id });
  assert.strictEqual(first.duplicate, false);
  const duplicate = await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referred.id });
  assert.strictEqual(duplicate.duplicate, true);
  assert.throws(() => referralService.createAttribution({ referrerUserId: other.id, referredUserId: referred.id }), /already attributed/);

  const before = await referralService.getQualifiedReferralCount(referrer.id);
  assert.strictEqual(before, 0);

  const qualified = await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'task',
    reference: `task-${suffix}`
  });
  assert.strictEqual(qualified.duplicate, false);
  assert.strictEqual(qualified.activation.duplicate, false);

  const repeatedQualification = await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'advertisement',
    reference: `ad-${suffix}`
  });
  assert.strictEqual(repeatedQualification.duplicate, true);

  const count = await referralService.getQualifiedReferralCount(referrer.id);
  assert.strictEqual(count, 1);

  const wallets = await query(
    `SELECT currency, balance FROM wallet_accounts WHERE user_id = $1 ORDER BY currency`,
    [referrer.id]
  );
  const balances = Object.fromEntries(wallets.rows.map(row => [row.currency, Number(row.balance)]));
  assert.strictEqual(balances.COIN, 10000);
  assert.strictEqual(balances.DZX, 10);
  assert.strictEqual(balances.DZP, 10);

  const lifetime = await referralService.creditLifetimeReward({
    referredUserId: referred.id,
    activityReference: `activity-${suffix}`,
    baseCoin: 1000,
    baseDzx: 10,
    baseDzp: 1
  });
  assert.strictEqual(lifetime.eligible, true);
  assert.strictEqual(lifetime.duplicate, false);
  assert.strictEqual(lifetime.reward.coin, 200);
  assert.strictEqual(lifetime.reward.dzx, 2);
  assert.strictEqual(lifetime.reward.dzp, 0.2);

  const lifetimeDuplicate = await referralService.creditLifetimeReward({
    referredUserId: referred.id,
    activityReference: `activity-${suffix}`,
    baseCoin: 1000,
    baseDzx: 10,
    baseDzp: 1
  });
  assert.strictEqual(lifetimeDuplicate.duplicate, true);

  const updatedWallets = await query(
    `SELECT currency, balance FROM wallet_accounts WHERE user_id = $1 ORDER BY currency`,
    [referrer.id]
  );
  const updatedBalances = Object.fromEntries(updatedWallets.rows.map(row => [row.currency, Number(row.balance)]));
  assert.strictEqual(updatedBalances.COIN, 10200);
  assert.strictEqual(updatedBalances.DZX, 12);
  assert.strictEqual(updatedBalances.DZP, 10.2);

  console.log('Phase 3 Referral invariants: PASS');
}

main().catch(error => {
  console.error('Phase 3 Referral invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
