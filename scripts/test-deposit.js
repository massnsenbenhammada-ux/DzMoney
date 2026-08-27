const assert = require('node:assert/strict');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets, ensureWallets } = require('../src/services/wallet-service');
const { processDeposit, confirmDeposit, getDepositByTxHash } = require('../src/services/deposit-service');

async function setSetting(key, value) {
  await query('UPDATE admin_settings SET value = $1::jsonb WHERE key = $2', [JSON.stringify(value), key]);
}

function evidence(txHash, tonAmount, network = 'mainnet') {
  const [whole, fraction = ''] = String(tonAmount).split('.');
  const amountNano = (BigInt(whole) * 1000000000n + BigInt((fraction + '000000000').slice(0, 9))).toString();
  return { status: 'VERIFIED', finality: 'FINALIZED', network, transactionHash: txHash, amountNano, confirmations: 1 };
}

async function cleanup(userIds) {
  for (const userId of userIds.filter(Boolean)) {
    await withTransaction(async client => {
      await client.query('DELETE FROM deposits WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)', [userId]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });
  }
}

async function main() {
  const marker = `ton-evidence-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  const rollbackTelegramUserId = telegramUserId - 1;
  let user;
  let rollbackUser;
  let originalLimit;
  let originalTimeout;

  try {
    const settings = await query(`SELECT key, value FROM admin_settings WHERE key IN ('deposit.daily_limit_ton','deposit.pending_timeout_hours')`);
    originalLimit = settings.rows.find(row => row.key === 'deposit.daily_limit_ton')?.value;
    originalTimeout = settings.rows.find(row => row.key === 'deposit.pending_timeout_hours')?.value;
    user = await createUser({ telegramUserId, username: marker, firstName: 'TON Evidence Gate Test' });
    assert.equal(Number((await getUserWallets(user.id)).find(w => w.currency === 'DZX').balance), 0);

    // 1) Client confirmation count can no longer create a confirmed deposit.
    const hash = `${marker}-fractional-ton-tx-1234567890`;
    await assert.rejects(
      () => processDeposit({ idempotencyKey: `${marker}:blocked`, userId: user.id, txHash: hash, tonAmount: 0.123456789, confirmationCount: 1 }),
      /TON Evidence Verifier/
    );
    const pending = await processDeposit({ idempotencyKey: `${marker}:fractional`, userId: user.id, txHash: hash, tonAmount: 0.123456789, confirmationCount: 0 });
    assert.equal(pending.deposit.status, 'PENDING');
    assert.equal(pending.credited, false);

    // 2) Missing, incomplete, mismatched and wrong-amount evidence never credits.
    await assert.rejects(() => confirmDeposit({ idempotencyKey: `${marker}:fractional` }), /Blockchain evidence is not verified/);
    await assert.rejects(() => confirmDeposit({ idempotencyKey: `${marker}:fractional`, verification: { status: 'HOLD', finality: 'NOT_FINALIZED' } }), /Blockchain evidence is not verified/);
    await assert.rejects(() => confirmDeposit({ idempotencyKey: `${marker}:fractional`, verification: evidence(`${marker}-other-tx-1234567890`, 0.123456789) }), /transaction mismatch/);
    await assert.rejects(() => confirmDeposit({ idempotencyKey: `${marker}:fractional`, verification: evidence(hash, 0.2) }), /amount mismatch/);

    // 3) A verified transaction credits exactly once.
    const confirmed = await confirmDeposit({ idempotencyKey: `${marker}:fractional`, verification: evidence(hash, 0.123456789) });
    assert.equal(confirmed.credited, true);
    assert.equal(confirmed.deposit.status, 'CONFIRMED');
    assert.equal(Number((await getUserWallets(user.id)).find(w => w.currency === 'DZX').balance), 1234.56789);
    const duplicate = await confirmDeposit({ idempotencyKey: `${marker}:fractional`, verification: evidence(hash, 0.123456789) });
    assert.equal(duplicate.duplicate, true);
    assert.equal(Number((await getUserWallets(user.id)).find(w => w.currency === 'DZX').balance), 1234.56789);

    // Same blockchain transaction cannot belong to another deposit.
    await assert.rejects(() => processDeposit({ idempotencyKey: `${marker}:different-key`, userId: user.id, txHash: hash, tonAmount: 0.123456789 }), /already been recorded|duplicate key|unique constraint/i);

    // 4) Idempotency-key mismatch remains protected.
    const reuseKey = `${marker}:reuse`;
    const reuseHash = `${marker}-reuse-ton-tx-1234567890`;
    await processDeposit({ idempotencyKey: reuseKey, userId: user.id, txHash: reuseHash, tonAmount: 0.1 });
    await assert.rejects(() => processDeposit({ idempotencyKey: reuseKey, userId: user.id, txHash: reuseHash, tonAmount: 0.2 }), /Idempotency key was already used with different deposit data/);

    // 5) Pending timeout rejects before any evidence can credit it.
    await setSetting('deposit.pending_timeout_hours', 24);
    const staleKey = `${marker}:stale`;
    const staleHash = `${marker}-stale-ton-tx-1234567890`;
    await processDeposit({ idempotencyKey: staleKey, userId: user.id, txHash: staleHash, tonAmount: 0.01 });
    await query(`UPDATE deposits SET created_at = NOW() - INTERVAL '25 hours' WHERE idempotency_key = $1`, [staleKey]);
    const stale = await confirmDeposit({ idempotencyKey: staleKey, verification: evidence(staleHash, 0.01) });
    assert.equal(stale.expired, true);
    assert.equal(stale.deposit.status, 'REJECTED');
    assert.equal(stale.credited, false);

    // 6) Daily limit remains atomic after evidence verification.
    await setSetting('deposit.daily_limit_ton', 1);
    const concurrent = [
      { key: `${marker}:concurrent-a`, hash: `${marker}-concurrent-a-ton-tx-1234567890` },
      { key: `${marker}:concurrent-b`, hash: `${marker}-concurrent-b-ton-tx-1234567890` },
    ];
    for (const item of concurrent) await processDeposit({ idempotencyKey: item.key, userId: user.id, txHash: item.hash, tonAmount: 0.6 });
    const results = await Promise.allSettled(concurrent.map(item => confirmDeposit({ idempotencyKey: item.key, verification: evidence(item.hash, 0.6) })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);

    // 7) Credit rollback remains transactional.
    await setSetting('deposit.daily_limit_ton', 10);
    rollbackUser = await createUser({ telegramUserId: rollbackTelegramUserId, username: `${marker}:rollback`, firstName: 'TON Rollback Test' });
    const rollbackKey = `${marker}:rollback`;
    const rollbackHash = `${marker}-rollback-ton-tx-1234567890`;
    await processDeposit({ idempotencyKey: rollbackKey, userId: rollbackUser.id, txHash: rollbackHash, tonAmount: 0.05 });
    await query('DELETE FROM wallet_accounts WHERE user_id = $1 AND currency = \'DZX\'', [rollbackUser.id]);
    await assert.rejects(() => confirmDeposit({ idempotencyKey: rollbackKey, verification: evidence(rollbackHash, 0.05) }), /Wallet not found|wallet|provision/i);
    assert.equal((await query('SELECT status FROM deposits WHERE idempotency_key = $1', [rollbackKey])).rows[0].status, 'PENDING');
    await withTransaction(client => ensureWallets(client, rollbackUser.id));

    // 8) Every confirmed deposit has exactly one DEPOSIT ledger transaction.
    const ledger = await query(`SELECT COUNT(*)::int AS count FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id JOIN deposits d ON d.id = (lt.metadata->>'deposit_id')::bigint WHERE d.user_id = $1 AND d.status = 'CONFIRMED' AND lt.transaction_type = 'DEPOSIT'`, [user.id]);
    const confirmedDeposits = await query(`SELECT COUNT(*)::int AS count FROM deposits WHERE user_id = $1 AND status = 'CONFIRMED'`, [user.id]);
    assert.equal(Number(ledger.rows[0].count), Number(confirmedDeposits.rows[0].count));
    assert.equal((await getDepositByTxHash(hash)).status, 'CONFIRMED');

    console.log('TON deposit evidence gate checklist: PASS');
    console.log('  ✓ client confirmation bypass blocked');
    console.log('  ✓ evidence status/finality/hash/amount enforced');
    console.log('  ✓ verified credit + idempotency');
    console.log('  ✓ duplicate transaction protection');
    console.log('  ✓ timeout, daily limit and rollback');
    console.log('  ✓ deposits + ledger audit');
  } finally {
    if (originalLimit !== undefined) await setSetting('deposit.daily_limit_ton', originalLimit);
    if (originalTimeout !== undefined) await setSetting('deposit.pending_timeout_hours', originalTimeout);
    await cleanup([user?.id, rollbackUser?.id]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('TON deposit evidence gate checklist: FAIL');
  console.error(error);
  process.exit(1);
});
