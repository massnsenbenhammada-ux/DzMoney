const assert = require('node:assert/strict');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets, ensureWallets } = require('../src/services/wallet-service');
const { processDeposit, confirmDeposit, getDepositByTxHash } = require('../src/services/deposit-service');

async function setSetting(key, value) {
  await query('UPDATE admin_settings SET value = $1::jsonb WHERE key = $2', [JSON.stringify(value), key]);
}

async function main() {
  const marker = `phase1-deposit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  const rollbackTelegramUserId = telegramUserId - 1;
  let user;
  let rollbackUser;
  let originalLimit = null;
  let originalTimeout = null;

  try {
    const settings = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('deposit.daily_limit_ton', 'deposit.pending_timeout_hours')`
    );
    originalLimit = settings.rows.find(r => r.key === 'deposit.daily_limit_ton')?.value;
    originalTimeout = settings.rows.find(r => r.key === 'deposit.pending_timeout_hours')?.value;

    user = await createUser({ telegramUserId, username: marker, firstName: 'Phase 1 Deposit Test' });
    let state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 0);

    // 1) Conversion, including a fractional TON amount.
    const fractionalKey = `${marker}:fractional`;
    const fractionalHash = `${marker}-fractional-ton-tx-1234567890`;
    const fractional = await processDeposit({
      idempotencyKey: fractionalKey,
      userId: user.id,
      txHash: fractionalHash,
      tonAmount: 0.123456789,
      confirmationCount: 1,
    });
    assert.equal(Number(fractional.deposit.dzx_amount), 1234.56789);
    assert.equal(fractional.credited, true);

    state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 1234.56789);

    // 2) Duplicate TX hash must never be credited twice.
    const duplicateTx = await processDeposit({
      idempotencyKey: fractionalKey,
      userId: user.id,
      txHash: fractionalHash,
      tonAmount: 0.123456789,
      confirmationCount: 1,
    });
    assert.equal(duplicateTx.duplicate, true);
    state = await getUserWallets(user.id);
    assert.equal(Number(state.find(w => w.currency === 'DZX').balance), 1234.56789);

    // Same TX hash with a different idempotency key is rejected.
    await assert.rejects(
      () => processDeposit({
        idempotencyKey: `${marker}:different-key`,
        userId: user.id,
        txHash: fractionalHash,
        tonAmount: 0.123456789,
        confirmationCount: 1,
      }),
      /already been recorded|duplicate key|unique constraint/i
    );

    // 3) Idempotency key reuse with different data is rejected.
    const reuseKey = `${marker}:reuse`;
    await processDeposit({
      idempotencyKey: reuseKey,
      userId: user.id,
      txHash: `${marker}-reuse-ton-tx-1234567890`,
      tonAmount: 0.1,
      confirmationCount: 0,
    });
    await assert.rejects(
      () => processDeposit({
        idempotencyKey: reuseKey,
        userId: user.id,
        txHash: `${marker}-reuse-ton-tx-1234567890`,
        tonAmount: 0.2,
        confirmationCount: 0,
      }),
      /Idempotency key was already used with different deposit data/
    );

    // 4) Pending timeout: a deposit older than 24h is rejected automatically.
    await setSetting('deposit.pending_timeout_hours', 24);
    const staleKey = `${marker}:stale`;
    const staleHash = `${marker}-stale-ton-tx-1234567890`;
    await processDeposit({
      idempotencyKey: staleKey,
      userId: user.id,
      txHash: staleHash,
      tonAmount: 0.01,
      confirmationCount: 0,
    });
    await query(
      `UPDATE deposits SET created_at = NOW() - INTERVAL '25 hours', updated_at = NOW() - INTERVAL '25 hours'
       WHERE idempotency_key = $1`,
      [staleKey]
    );
    const staleConfirmation = await confirmDeposit({ idempotencyKey: staleKey, confirmationCount: 1 });
    assert.equal(staleConfirmation.expired, true);
    assert.equal(staleConfirmation.deposit.status, 'REJECTED');
    assert.equal(staleConfirmation.credited, false);

    // 5) Daily limit: concurrent confirmations for the same user cannot both pass.
    await setSetting('deposit.daily_limit_ton', 1);
    const concurrent = [
      { key: `${marker}:concurrent-a`, hash: `${marker}-concurrent-a-ton-tx-1234567890` },
      { key: `${marker}:concurrent-b`, hash: `${marker}-concurrent-b-ton-tx-1234567890` },
    ];
    for (const item of concurrent) {
      await processDeposit({
        idempotencyKey: item.key,
        userId: user.id,
        txHash: item.hash,
        tonAmount: 0.6,
        confirmationCount: 0,
      });
    }
    const concurrentResults = await Promise.allSettled(
      concurrent.map(item => confirmDeposit({ idempotencyKey: item.key, confirmationCount: 1 }))
    );
    const fulfilled = concurrentResults.filter(r => r.status === 'fulfilled');
    const rejected = concurrentResults.filter(r => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const concurrentStatuses = await query(
      `SELECT status, COUNT(*)::int AS count
       FROM deposits WHERE idempotency_key = ANY($1::text[])
       GROUP BY status`,
      [concurrent.map(x => x.key)]
    );
    const confirmedCount = Number(concurrentStatuses.rows.find(r => r.status === 'CONFIRMED')?.count || 0);
    assert.equal(confirmedCount, 1);

    // 6) Rollback: use a fresh user so removing its DZX wallet cannot conflict with prior ledger entries.
    await setSetting('deposit.daily_limit_ton', 10);
    rollbackUser = await createUser({
      telegramUserId: rollbackTelegramUserId,
      username: `${marker}:rollback-user`,
      firstName: 'Phase 1 Deposit Rollback Test',
    });
    const rollbackKey = `${marker}:rollback`;
    const rollbackHash = `${marker}-rollback-ton-tx-1234567890`;
    await processDeposit({
      idempotencyKey: rollbackKey,
      userId: rollbackUser.id,
      txHash: rollbackHash,
      tonAmount: 0.05,
      confirmationCount: 0,
    });
    await query('DELETE FROM wallet_accounts WHERE user_id = $1 AND currency = \'DZX\'', [rollbackUser.id]);
    await assert.rejects(
      () => confirmDeposit({ idempotencyKey: rollbackKey, confirmationCount: 1 }),
      /Wallet not found|wallet|provision/i
    );
    const rollbackDeposit = await query('SELECT status FROM deposits WHERE idempotency_key = $1', [rollbackKey]);
    assert.equal(rollbackDeposit.rows[0].status, 'PENDING');
    await withTransaction(client => ensureWallets(client, rollbackUser.id));

    // 7) Audit: every confirmed deposit has one DEPOSIT ledger transaction.
    const ledger = await query(
      `SELECT COUNT(*)::int AS count
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       JOIN deposits d ON d.id = (lt.metadata->>'deposit_id')::bigint
       WHERE d.user_id = $1 AND d.status = 'CONFIRMED' AND lt.transaction_type = 'DEPOSIT'`,
      [user.id]
    );
    const confirmedDeposits = await query(
      `SELECT COUNT(*)::int AS count FROM deposits WHERE user_id = $1 AND status = 'CONFIRMED'`,
      [user.id]
    );
    assert.equal(Number(ledger.rows[0].count), Number(confirmedDeposits.rows[0].count));

    const found = await getDepositByTxHash(fractionalHash);
    assert.equal(found.status, 'CONFIRMED');

    console.log('Phase 1 deposit pre-launch checklist: PASS');
    console.log('  ✓ daily limit');
    console.log('  ✓ duplicate TX hash');
    console.log('  ✓ idempotency mismatch');
    console.log('  ✓ 24h pending timeout');
    console.log('  ✓ concurrent confirmations');
    console.log('  ✓ fractional TON → DZX conversion');
    console.log('  ✓ confirmation rollback');
    console.log('  ✓ deposits + ledger audit');
  } finally {
    if (originalLimit !== null) await setSetting('deposit.daily_limit_ton', originalLimit);
    if (originalTimeout !== null) await setSetting('deposit.pending_timeout_hours', originalTimeout);
    for (const testUser of [user, rollbackUser]) {
      if (!testUser) continue;
      await withTransaction(async client => {
        await client.query('DELETE FROM deposits WHERE user_id = $1', [testUser.id]);
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)', [testUser.id]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id = $1', [testUser.id]);
        await client.query('DELETE FROM users WHERE id = $1', [testUser.id]);
      });
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Phase 1 deposit pre-launch checklist: FAIL');
  console.error(error);
  process.exit(1);
});
