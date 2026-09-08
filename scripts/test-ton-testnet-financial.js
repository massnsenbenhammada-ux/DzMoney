'use strict';

const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { processDeposit, confirmDeposit } = require('../src/services/deposit-service');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const txHash = required('TON_TESTNET_TX_HASH').toLowerCase();
  const tonAmount = required('TON_TESTNET_AMOUNT');
  const destination = required('TON_TESTNET_DEPOSIT_ADDRESS');
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let userId;
  let depositId;
  try {
    const user = await pool.query('INSERT INTO users (telegram_user_id,username,first_name) VALUES ($1,$2,$3) RETURNING id', [`ton_test_${marker}`, `ton_test_${marker}`, 'TON Testnet']);
    userId = user.rows[0].id;
    await withTransaction(async client => {
      for (const currency of ['COIN', 'DZX', 'DZP']) await client.query('INSERT INTO wallet_accounts (user_id,currency) VALUES ($1,$2)', [userId, currency]);
      await client.query("INSERT INTO admin_settings(key,value) VALUES ('deposit.ton.active_network','\"testnet\"'::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
      await client.query('INSERT INTO admin_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', ['deposit.ton.testnet_address', JSON.stringify(destination)]);
      await client.query("INSERT INTO admin_settings(key,value) VALUES ('deposit.enabled','true'::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
      await client.query("INSERT INTO admin_settings(key,value) VALUES ('deposit.required_confirmations','1'::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
    });

    const pending = await processDeposit({ userId, idempotencyKey: `ton-test:${marker}`, txHash, tonAmount, metadata: { test: true } });
    depositId = pending.deposit.id;
    assert.equal(pending.deposit.status, 'PENDING');

    const confirmed = await confirmDeposit({ idempotencyKey: `ton-test:${marker}`, metadata: { test: true } });
    assert.equal(confirmed.credited, true);
    assert.equal(confirmed.deposit.status, 'CONFIRMED');
    assert.equal(confirmed.deposit.network, 'testnet');
    assert.equal(confirmed.deposit.tx_hash, txHash);

    const balance = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=\'DZX\'', [userId]);
    assert.ok(Number(balance.rows[0].balance) > 0);
    const ledger = await pool.query('SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND type=\'DEPOSIT\'', [userId]);
    assert.equal(ledger.rows[0].count, 1);

    const duplicate = await confirmDeposit({ idempotencyKey: `ton-test:${marker}` });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.credited, true);
    console.log(`TON testnet financial gate: PASS (deposit=${depositId}, amount=${tonAmount} TON)`);
  } finally {
    await withTransaction(async client => {
      if (userId) {
        await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
        await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM deposits WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM deposit_daily_usage WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
        await client.query('DELETE FROM users WHERE id=$1', [userId]);
      }
    });
    await pool.end();
  }
}

main().catch(error => { console.error('TON testnet financial gate: FAIL'); console.error(error); process.exit(1); });
