const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const { pool } = require('../src/db/pool');

async function createQualifiedReferral(suffix) {
  const referrer = await walletService.createUser({ telegramUserId: `8${suffix}01` });
  const referred = await walletService.createUser({ telegramUserId: `8${suffix}02` });
  await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referred.id });
  const task = await pool.query(
    `INSERT INTO task_attempts (user_id, status) VALUES ($1, 'verified') RETURNING id`,
    [referred.id]
  );
  await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'task',
    referenceId: task.rows[0].id,
    idempotencyKey: `qualification-${suffix}`,
  });
  return { referrer, referred };
}

async function balances(userId) {
  const result = await pool.query(
    `SELECT currency, balance FROM wallet_accounts WHERE user_id = $1 ORDER BY currency`,
    [userId]
  );
  return Object.fromEntries(result.rows.map(row => [row.currency, Number(row.balance)]));
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const { referrer, referred } = await createQualifiedReferral(suffix);
  const before = await balances(referrer.id);

  const first = await referralService.activateReferral({
    referredUserId: referred.id,
    idempotencyKey: `activation-${suffix}`,
  });
  assert.strictEqual(first.duplicate, false);
  const after = await balances(referrer.id);
  assert.strictEqual(after.COIN - before.COIN, 10000);
  assert.strictEqual(after.DZX - before.DZX, 10);
  assert.strictEqual(after.DZP - before.DZP, 10);

  const retry = await referralService.activateReferral({
    referredUserId: referred.id,
    idempotencyKey: `activation-${suffix}`,
  });
  assert.strictEqual(retry.duplicate, true);
  assert.deepStrictEqual(await balances(referrer.id), after);

  await assert.rejects(
    referralService.activateReferral({
      referredUserId: referred.id,
      idempotencyKey: `activation-other-${suffix}`,
    }),
    /already activated/
  );

  const ledger = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ledger_entries le
     JOIN ledger_transactions lt ON lt.id = le.transaction_id
     WHERE lt.user_id = $1 AND lt.transaction_type = 'REWARD'
       AND lt.metadata->>'source' = 'referral_activation'`,
    [referrer.id]
  );
  assert.strictEqual(ledger.rows[0].count, 3);

  console.log('Referral activation invariants: PASS');
}

main()
  .catch(error => {
    console.error('Referral activation invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
