const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');
const { processDeposit } = require('../src/services/deposit-service');

async function main() {
  const marker = `monetary-precision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user;

  try {
    user = await createUser({
      telegramUserId: -Date.now(),
      username: marker,
      firstName: 'Monetary Precision Test',
    });

    const exactLargeAmount = '9007199254740993';
    await postEconomyTransaction({
      idempotencyKey: `${marker}:large`,
      userId: user.id,
      type: 'TEST_CREDIT',
      metadata: { source: 'monetary-precision-test' },
      movements: [{ currency: 'DZX', amount: exactLargeAmount, source: 'test' }],
    });

    const largeBalance = await pool.query(
      `SELECT trim_scale(balance)::text AS balance
       FROM wallet_accounts
       WHERE user_id = $1 AND currency = 'DZX'`,
      [user.id]
    );
    assert.equal(largeBalance.rows[0].balance, exactLargeAmount);

    const largeLedger = await pool.query(
      `SELECT trim_scale(le.amount)::text AS amount,
              trim_scale(le.balance_before)::text AS balance_before,
              trim_scale(le.balance_after)::text AS balance_after
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.idempotency_key = $1`,
      [`${marker}:large`]
    );
    assert.equal(largeLedger.rows[0].amount, exactLargeAmount);
    assert.equal(largeLedger.rows[0].balance_before, '0');
    assert.equal(largeLedger.rows[0].balance_after, exactLargeAmount);

    await postEconomyTransaction({
      idempotencyKey: `${marker}:decimal-a`,
      userId: user.id,
      type: 'TEST_CREDIT',
      metadata: { source: 'monetary-precision-test' },
      movements: [{ currency: 'DZX', amount: '0.1', source: 'test' }],
    });
    await postEconomyTransaction({
      idempotencyKey: `${marker}:decimal-b`,
      userId: user.id,
      type: 'TEST_CREDIT',
      metadata: { source: 'monetary-precision-test' },
      movements: [{ currency: 'DZX', amount: '0.2', source: 'test' }],
    });

    const decimalLedger = await pool.query(
      `SELECT trim_scale(le.balance_after)::text AS balance_after
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.idempotency_key = $1`,
      [`${marker}:decimal-b`]
    );
    assert.equal(decimalLedger.rows[0].balance_after, '9007199254740993.3');

    const exactTonAmount = '900719925474.0993';
    const pendingDeposit = await processDeposit({
      idempotencyKey: `${marker}:ton-precision`,
      userId: user.id,
      txHash: `${marker}-ton-precision-tx-1234567890`,
      tonAmount: exactTonAmount,
      confirmationCount: 0,
    });
    assert.equal(pendingDeposit.deposit.status, 'PENDING');
    assert.equal(pendingDeposit.deposit.ton_amount, exactTonAmount);
    assert.equal(pendingDeposit.deposit.dzx_amount, '9007199254740993');

    console.log('Monetary precision invariants: PASS');
  } finally {
    if (user) {
      await withTransaction(async client => {
        await client.query('DELETE FROM deposits WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)', [user.id]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM users WHERE id = $1', [user.id]);
      });
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Monetary precision invariants: FAIL');
  console.error(error);
  process.exit(1);
});
