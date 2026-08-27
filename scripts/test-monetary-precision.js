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
      `SELECT balance = $2::numeric AS matches
       FROM wallet_accounts
       WHERE user_id = $1 AND currency = 'DZX'`,
      [user.id, exactLargeAmount]
    );
    assert.equal(largeBalance.rows[0].matches, true);

    const largeLedger = await pool.query(
      `SELECT le.amount = $2::numeric AS amount_matches,
              le.balance_before = 0::numeric AS before_matches,
              le.balance_after = $2::numeric AS after_matches
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.idempotency_key = $1`,
      [`${marker}:large`, exactLargeAmount]
    );
    assert.equal(largeLedger.rows[0].amount_matches, true);
    assert.equal(largeLedger.rows[0].before_matches, true);
    assert.equal(largeLedger.rows[0].after_matches, true);

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
      `SELECT le.balance_after = $2::numeric AS matches
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.idempotency_key = $1`,
      [`${marker}:decimal-b`, '9007199254740993.3']
    );
    assert.equal(decimalLedger.rows[0].matches, true);

    const exactTonAmount = '900719925474.0993';
    const pendingDeposit = await processDeposit({
      idempotencyKey: `${marker}:ton-precision`,
      userId: user.id,
      txHash: '0000000000000000000000000000000000000000000000000000000000000001',
      tonAmount: exactTonAmount,
      confirmationCount: 0,
    });
    assert.equal(pendingDeposit.deposit.status, 'PENDING');

    const depositValues = await pool.query(
      `SELECT ton_amount = $2::numeric AS ton_matches,
              dzx_amount = $3::numeric AS dzx_matches
       FROM deposits
       WHERE id = $1`,
      [pendingDeposit.deposit.id, exactTonAmount, '9007199254740993']
    );
    assert.equal(depositValues.rows[0].ton_matches, true);
    assert.equal(depositValues.rows[0].dzx_matches, true);

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
