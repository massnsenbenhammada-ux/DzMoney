const assert = require('node:assert/strict');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets } = require('../src/services/wallet-service');
const {
  processDeposit,
  confirmDeposit,
  getDepositByTxHash,
} = require('../src/services/deposit-service');

async function main() {
  const marker = `phase1-deposit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  let user;

  try {
    user = await createUser({ telegramUserId, username: marker, firstName: 'Phase 1 Deposit Test' });

    let state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 0);

    const idempotencyKey = `${marker}:deposit`;
    const txHash = `${marker}-ton-tx-1234567890`;

    const pending = await processDeposit({
      idempotencyKey,
      userId: user.id,
      txHash,
      tonAmount: 0.2,
      confirmationCount: 0,
      metadata: { provider: 'test' },
    });
    assert.equal(pending.duplicate, false);
    assert.equal(pending.credited, false);
    assert.equal(pending.deposit.status, 'PENDING');
    assert.equal(Number(pending.deposit.ton_amount), 0.2);
    assert.equal(Number(pending.deposit.dzx_amount), 2000);

    state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 0);

    const confirmed = await confirmDeposit({
      idempotencyKey,
      confirmationCount: 1,
      metadata: { verified_by: 'test' },
    });
    assert.equal(confirmed.duplicate, false);
    assert.equal(confirmed.credited, true);
    assert.equal(confirmed.deposit.status, 'CONFIRMED');
    assert.equal(confirmed.economy.transaction.transaction_type, 'DEPOSIT');

    state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 2000);

    const duplicateProcess = await processDeposit({
      idempotencyKey,
      userId: user.id,
      txHash,
      tonAmount: 0.2,
      confirmationCount: 1,
    });
    assert.equal(duplicateProcess.duplicate, true);
    assert.equal(duplicateProcess.credited, true);

    const duplicateConfirm = await confirmDeposit({
      idempotencyKey,
      confirmationCount: 10,
    });
    assert.equal(duplicateConfirm.duplicate, true);
    assert.equal(duplicateConfirm.credited, true);

    state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 2000);

    await assert.rejects(
      () => processDeposit({
        idempotencyKey: `${marker}:different-key`,
        userId: user.id,
        txHash,
        tonAmount: 0.3,
        confirmationCount: 1,
      }),
      /duplicate key|unique constraint/i
    );

    await assert.rejects(
      () => processDeposit({
        idempotencyKey: `${marker}:bad-reuse`,
        userId: user.id,
        txHash: `${marker}-another-ton-tx-1234567890`,
        tonAmount: 0.1,
        confirmationCount: 0,
      })
        .then(() => processDeposit({
          idempotencyKey: `${marker}:bad-reuse`,
          userId: user.id,
          txHash: `${marker}-another-ton-tx-1234567890`,
          tonAmount: 0.2,
          confirmationCount: 0,
        })),
      /Idempotency key was already used with different deposit data/
    );

    const found = await getDepositByTxHash(txHash);
    assert.equal(found.status, 'CONFIRMED');

    const ledger = await query(
      `SELECT COUNT(*)::int AS count
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.user_id = $1 AND lt.transaction_type = 'DEPOSIT'`,
      [user.id]
    );
    assert.equal(Number(ledger.rows[0].count), 1);

    console.log('Phase 1 deposit integration: PASS');
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
  console.error('Phase 1 deposit integration: FAIL');
  console.error(error);
  process.exit(1);
});
