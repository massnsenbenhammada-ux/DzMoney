const assert = require('node:assert/strict');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets } = require('../src/services/wallet-service');
const {
  creditActivityReward,
  convertCoinToDzp,
  convertDzxToDzp,
  postEconomyTransaction,
} = require('../src/services/economy-service');

async function main() {
  const marker = `phase1-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  let user;

  try {
    user = await createUser({ telegramUserId, username: marker, firstName: 'Phase 1 Ledger Test' });
    const wallets = await getUserWallets(user.id);
    assert.deepEqual(wallets.map(w => w.currency).sort(), ['COIN', 'DZP', 'DZX']);
    assert.ok(wallets.every(w => Number(w.balance) === 0));

    const rewardKey = `${marker}:reward`;
    const firstReward = await creditActivityReward({
      idempotencyKey: rewardKey,
      userId: user.id,
      source: 'advertisement',
      coin: 10000,
      dzx: 10,
      dzp: 1,
      modifiers: [{ type: 'squad', rate: 0.5 }],
    });
    assert.equal(firstReward.duplicate, false);

    const duplicateReward = await creditActivityReward({
      idempotencyKey: rewardKey,
      userId: user.id,
      source: 'advertisement',
      coin: 10000,
      dzx: 10,
      dzp: 1,
      modifiers: [{ type: 'squad', rate: 0.5 }],
    });
    assert.equal(duplicateReward.duplicate, true);

    let state = await getUserWallets(user.id);
    const balancesAfterReward = Object.fromEntries(state.map(w => [w.currency, Number(w.balance)]));
    assert.equal(balancesAfterReward.COIN, 10000);
    assert.equal(balancesAfterReward.DZX, 10);
    assert.equal(balancesAfterReward.DZP, 1);
    assert.equal(Number(state.find(w => w.currency === 'DZP').earned_dzp), 1);

    const rewardTx = await query(
      `SELECT transaction_type, metadata
       FROM ledger_transactions
       WHERE idempotency_key = $1`,
      [rewardKey]
    );
    assert.equal(rewardTx.rows[0].transaction_type, 'REWARD');
    assert.equal(rewardTx.rows[0].metadata.source, 'advertisement');
    assert.equal(rewardTx.rows[0].metadata.modifiers[0].type, 'squad');
    assert.equal(Number(rewardTx.rows[0].metadata.modifiers[0].rate), 0.5);

    const promoReward = await creditActivityReward({
      idempotencyKey: `${marker}:promo`,
      userId: user.id,
      source: 'promo',
      dzx: 2,
    });
    assert.equal(promoReward.duplicate, false);

    state = await getUserWallets(user.id);
    const afterPromo = Object.fromEntries(state.map(w => [w.currency, Number(w.balance)]));
    assert.equal(afterPromo.COIN, 10000);
    assert.equal(afterPromo.DZX, 12);
    assert.equal(afterPromo.DZP, 1);

    assert.throws(
      () => creditActivityReward({
        idempotencyKey: `${marker}:squad-source`,
        userId: user.id,
        source: 'squad',
        dzx: 1,
      }),
      /Invalid activity reward source/
    );

    const coinConversion = await convertCoinToDzp({
      idempotencyKey: `${marker}:coin-to-dzp`,
      userId: user.id,
      coin: 10000,
    });
    assert.equal(coinConversion.dzp, 1);

    state = await getUserWallets(user.id);
    const afterCoinConversion = state.find(w => w.currency === 'DZP');
    assert.equal(Number(afterCoinConversion.balance), 2);
    assert.equal(Number(afterCoinConversion.earned_dzp), 1);
    assert.equal(Number(afterCoinConversion.converted_dzp), 1);

    const dzxConversion = await convertDzxToDzp({
      idempotencyKey: `${marker}:dzx-to-dzp`,
      userId: user.id,
      dzx: 10,
    });
    assert.equal(dzxConversion.dzp, 1);

    state = await getUserWallets(user.id);
    const afterDzxConversion = state.find(w => w.currency === 'DZP');
    assert.equal(Number(afterDzxConversion.balance), 3);
    assert.equal(Number(afterDzxConversion.converted_dzp), 2);
    assert.equal(Number(afterDzxConversion.earned_dzp), 1);

    await postEconomyTransaction({
      idempotencyKey: `${marker}:purchase-dzp`,
      userId: user.id,
      type: 'PACKAGE_PURCHASE',
      metadata: { source: 'purchase' },
      movements: [{
        currency: 'DZP',
        amount: 5,
        source: 'purchase',
        dzpBucket: 'purchased_dzp',
      }],
    });

    state = await getUserWallets(user.id);
    const afterPurchase = state.find(w => w.currency === 'DZP');
    assert.equal(Number(afterPurchase.balance), 8);
    assert.equal(Number(afterPurchase.purchased_dzp), 5);
    assert.equal(Number(afterPurchase.earned_dzp), 1);
    assert.equal(Number(afterPurchase.converted_dzp), 2);

    await assert.rejects(
      () => postEconomyTransaction({
        idempotencyKey: `${marker}:overspend`,
        userId: user.id,
        type: 'TEST_DEBIT',
        movements: [{ currency: 'DZX', amount: -999999, source: 'test' }],
      }),
      /Insufficient DZX balance/
    );

    const ledger = await query(
      `SELECT COUNT(*)::int AS count
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.user_id = $1`,
      [user.id]
    );
    // 3 activity reward entries + 1 promo entry + 2 COIN conversion + 2 DZX conversion + 1 purchase.
    // The overspend transaction is rolled back, so it must not leave a ledger entry behind.
    assert.equal(Number(ledger.rows[0].count), 9);

    const badBalances = await query(
      `SELECT COUNT(*)::int AS count
       FROM wallet_accounts
       WHERE user_id = $1
         AND (balance < 0 OR earned_dzp < 0 OR converted_dzp < 0 OR purchased_dzp < 0)`,
      [user.id]
    );
    assert.equal(Number(badBalances.rows[0].count), 0);

    console.log('Phase 1 economy + ledger integration: PASS');
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

main().catch(error => {
  console.error('Phase 1 economy + ledger integration: FAIL');
  console.error(error);
  process.exit(1);
});
