const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const economyService = require('../src/services/economy-service');
const { pool } = require('../src/db/pool');

async function balances(userId) {
  const result = await pool.query('SELECT currency,balance FROM wallet_accounts WHERE user_id=$1 ORDER BY currency', [userId]);
  return Object.fromEntries(result.rows.map(row => [row.currency, Number(row.balance)]));
}

async function qualifiedReferral(suffix) {
  const referrer = await walletService.createUser({ telegramUserId: `7${suffix}01` });
  const referred = await walletService.createUser({ telegramUserId: `7${suffix}02` });
  await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referred.id });
  const task = await pool.query("INSERT INTO activity_tasks(task_type,title,reward_coin) VALUES('game','Referral lifetime test',1) RETURNING id");
  const attempt = await pool.query(
    `INSERT INTO task_attempts(task_id,user_id,status,execute_idempotency_key,verified_at)
     VALUES($1,$2,'verified',$3,NOW()) RETURNING id`,
    [task.rows[0].id, referred.id, `lifetime-qualification-${suffix}`]
  );
  await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'task',
    referenceId: attempt.rows[0].id,
    idempotencyKey: `lifetime-qualification-${suffix}`,
  });
  return { referrer, referred };
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const { referrer, referred } = await qualifiedReferral(suffix);
  const before = await balances(referrer.id);

  const first = await referralService.creditReferralLifetime({
    referredUserId: referred.id,
    source: 'task',
    sourceReferenceId: `task-${suffix}`,
    idempotencyKey: `lifetime-${suffix}`,
    baseReward: { coin: 1000, dzx: 5, dzp: 1 },
  });
  assert.strictEqual(first.qualified, true);
  assert.strictEqual(first.duplicate, false);
  const after = await balances(referrer.id);
  assert.strictEqual(after.COIN - before.COIN, 200);
  assert.strictEqual(after.DZX - before.DZX, 1);
  assert.strictEqual(after.DZP - before.DZP, 0);

  const retry = await referralService.creditReferralLifetime({
    referredUserId: referred.id,
    source: 'task',
    sourceReferenceId: `task-${suffix}`,
    idempotencyKey: `lifetime-${suffix}`,
    baseReward: { coin: 1000, dzx: 5, dzp: 1 },
  });
  assert.strictEqual(retry.duplicate, true);
  assert.deepStrictEqual(await balances(referrer.id), after);

  await assert.rejects(
    referralService.creditReferralLifetime({
      referredUserId: referred.id,
      source: 'promo',
      sourceReferenceId: `promo-${suffix}`,
      idempotencyKey: `promo-lifetime-${suffix}`,
      baseReward: { coin: 1000, dzx: 5, dzp: 1 },
    }),
    /Invalid lifetime referral source/
  );

  const pendingReferrer = await walletService.createUser({ telegramUserId: `6${suffix}01` });
  const pendingReferred = await walletService.createUser({ telegramUserId: `6${suffix}02` });
  await referralService.createAttribution({ referrerUserId: pendingReferrer.id, referredUserId: pendingReferred.id });
  const pendingBefore = await balances(pendingReferrer.id);
  const pending = await referralService.creditReferralLifetime({
    referredUserId: pendingReferred.id,
    source: 'advertisement',
    sourceReferenceId: `pending-ad-${suffix}`,
    idempotencyKey: `pending-lifetime-${suffix}`,
    baseReward: { coin: 1000, dzx: 5, dzp: 1 },
  });
  assert.strictEqual(pending.qualified, false);
  assert.strictEqual(pending.duplicate, false);
  assert.deepStrictEqual(await balances(pendingReferrer.id), pendingBefore);

  const ledger = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ledger_transactions
     WHERE user_id=$1 AND transaction_type='REWARD'
       AND metadata->>'source'='referral_lifetime'`,
    [referrer.id]
  );
  assert.strictEqual(ledger.rows[0].count, 1);

  console.log('Referral lifetime 20 percent invariants: PASS');
}

main()
  .catch(error => {
    console.error('Referral lifetime 20 percent invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
