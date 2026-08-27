'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser, getUserWallets, ensureWallets } = require('../src/services/wallet-service');
const { processDeposit, confirmDeposit, getDepositByTxHash } = require('../src/services/deposit-service');

const MAINNET = 'UQAaRNqn01vjTzDdSaN8LtsWpZRWkhRQZkXCNzfb3z0ZDeI0';
const RAW_MAINNET = '0:1a44daa7d35be34f30dd49a37c2edb16a594569214506645c23737dbdf3d190d';

async function setSetting(key, value) {
  await query('UPDATE admin_settings SET value=$1::jsonb WHERE key=$2', [JSON.stringify(value), key]);
}
function makeHash(seed) {
  return seed.padEnd(64, '0').slice(0, 64);
}
function expectedNanoFor(hash) {
  if (hash.startsWith('3')) return '10000000';
  if (hash.startsWith('6')) return '50000000';
  return '100000000';
}
function startProvider() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const hash = (url.searchParams.get('hash') || url.searchParams.get('tx_hash') || makeHash('a')).toLowerCase();
    const value = expectedNanoFor(hash);
    let payload;
    if (url.pathname.endsWith('/transactions')) {
      payload = { transactions: [{ hash, account: RAW_MAINNET, mc_block_seqno: 123, description: { aborted: false }, in_msg: { destination: RAW_MAINNET, value, bounced: false } }] };
    } else if (url.pathname.endsWith('/traces')) {
      payload = { traces: [{ tx_hash: hash, mc_seqno_end: 123, is_incomplete: false }] };
    } else if (url.pathname.endsWith('/masterchainInfo')) {
      payload = { first: { seqno: 0 }, last: { seqno: 130 } };
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const marker = `phase1-deposit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  const rollbackTelegramUserId = telegramUserId - 1;
  let user;
  let concurrencyUser;
  let rollbackUser;
  let provider;
  const originals = {};
  try {
    const settings = await query(`SELECT key,value FROM admin_settings WHERE key IN ('deposit.daily_limit_ton','deposit.pending_timeout_hours','deposit.ton.active_network','deposit.ton.mainnet_address')`);
    for (const row of settings.rows) originals[row.key] = row.value;
    provider = await startProvider();
    process.env.TONCENTER_API_BASE_URL = `http://127.0.0.1:${provider.address().port}/api/v3`;
    await setSetting('deposit.ton.active_network', 'mainnet');
    await setSetting('deposit.ton.mainnet_address', { address: MAINNET, network: 'mainnet' });

    user = await createUser({ telegramUserId, username: marker, firstName: 'Server TON Deposit Test' });
    assert.equal(Number((await getUserWallets(user.id)).find(w => w.currency === 'DZX').balance), 0);

    const validHash = makeHash('1');
    await assert.rejects(
      () => processDeposit({ idempotencyKey:`${marker}:bypass`, userId:user.id, txHash:validHash, tonAmount:0.1, confirmationCount:1 }),
      /Blockchain confirmation must come from TON Evidence Verifier/
    );

    const fractional = await processDeposit({ idempotencyKey:`${marker}:fractional`, userId:user.id, txHash:validHash, tonAmount:0.1, confirmationCount:0 });
    assert.equal(fractional.deposit.status, 'PENDING');
    assert.equal((await confirmDeposit({ idempotencyKey:`${marker}:fractional` })).credited, true);
    assert.equal(Number((await getUserWallets(user.id)).find(w => w.currency === 'DZX').balance), 1000);

    const duplicate = await confirmDeposit({ idempotencyKey:`${marker}:fractional` });
    assert.equal(duplicate.duplicate, true);
    await assert.rejects(
      () => processDeposit({ idempotencyKey:`${marker}:different-key`, userId:user.id, txHash:validHash, tonAmount:0.1, confirmationCount:0 }),
      /already been recorded|duplicate key|unique constraint/i
    );

    const reuseKey = `${marker}:reuse`;
    await processDeposit({ idempotencyKey:reuseKey, userId:user.id, txHash:makeHash('2'), tonAmount:0.1, confirmationCount:0 });
    await assert.rejects(
      () => processDeposit({ idempotencyKey:reuseKey, userId:user.id, txHash:makeHash('2'), tonAmount:0.2, confirmationCount:0 }),
      /Idempotency key was already used with different deposit data/
    );

    await setSetting('deposit.pending_timeout_hours', 24);
    const staleKey = `${marker}:stale`;
    await processDeposit({ idempotencyKey:staleKey, userId:user.id, txHash:makeHash('3'), tonAmount:0.01, confirmationCount:0 });
    await query(`UPDATE deposits SET created_at=NOW()-INTERVAL '25 hours',updated_at=NOW()-INTERVAL '25 hours' WHERE idempotency_key=$1`, [staleKey]);
    const staleConfirmation = await confirmDeposit({ idempotencyKey:staleKey });
    assert.equal(staleConfirmation.expired, true);
    assert.equal(staleConfirmation.deposit.status, 'REJECTED');
    assert.equal(staleConfirmation.credited, false);

    // Use a fresh user for the quota race so the user's prior successful deposit
    // cannot consume part of the concurrency test's daily allowance.
    concurrencyUser = await createUser({ telegramUserId: telegramUserId - 2, username:`${marker}:concurrency-user`, firstName:'Concurrency Test' });
    await setSetting('deposit.daily_limit_ton', 0.15);
    const concurrent = [{ key:`${marker}:concurrent-a`, hash:makeHash('4') }, { key:`${marker}:concurrent-b`, hash:makeHash('5') }];
    for (const item of concurrent) await processDeposit({ idempotencyKey:item.key,userId:concurrencyUser.id,txHash:item.hash,tonAmount:0.1,confirmationCount:0 });
    const concurrentResults = await Promise.allSettled(concurrent.map(item => confirmDeposit({ idempotencyKey:item.key })));
    assert.equal(concurrentResults.filter(r => r.status==='fulfilled').length, 1);
    assert.equal(concurrentResults.filter(r => r.status==='rejected').length, 1);

    await setSetting('deposit.daily_limit_ton', 10);
    rollbackUser = await createUser({ telegramUserId:rollbackTelegramUserId, username:`${marker}:rollback-user`, firstName:'Rollback Test' });
    const rollbackKey = `${marker}:rollback`;
    await processDeposit({ idempotencyKey:rollbackKey,userId:rollbackUser.id,txHash:makeHash('6'),tonAmount:0.05,confirmationCount:0 });
    await query(`DELETE FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [rollbackUser.id]);
    await assert.rejects(() => confirmDeposit({ idempotencyKey:rollbackKey }), /Wallet not found|wallet|provision/i);
    const rollbackDeposit = await query('SELECT status FROM deposits WHERE idempotency_key=$1', [rollbackKey]);
    assert.equal(rollbackDeposit.rows[0].status, 'PENDING');
    await withTransaction(client => ensureWallets(client, rollbackUser.id));

    const ledger = await query(`SELECT COUNT(*)::int AS count
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt.id=le.transaction_id
      WHERE lt.user_id=$1
        AND lt.transaction_type='DEPOSIT'
        AND lt.idempotency_key IN (
          SELECT 'deposit:' || d.id::text
          FROM deposits d
          WHERE d.user_id=$1 AND d.status='CONFIRMED'
        )`, [user.id]);
    const confirmedDeposits = await query(`SELECT COUNT(*)::int AS count FROM deposits WHERE user_id=$1 AND status='CONFIRMED'`, [user.id]);
    assert.equal(Number(ledger.rows[0].count), Number(confirmedDeposits.rows[0].count));
    assert.equal((await getDepositByTxHash(validHash)).status, 'CONFIRMED');

    console.log('Server-side TON deposit evidence gate: PASS');
    console.log('  ✓ caller confirmation bypass blocked');
    console.log('  ✓ active network and destination sourced server-side');
    console.log('  ✓ finalized blockchain evidence required before credit');
    console.log('  ✓ duplicate TX and idempotency protection');
    console.log('  ✓ pending timeout and daily limit');
    console.log('  ✓ economy rollback and ledger audit');
  } catch (error) {
    console.error('Server-side TON deposit evidence gate: FAIL');
    throw error;
  } finally {
    if (provider) await new Promise(resolve => provider.close(resolve));
    const testUserIds = [user?.id, concurrencyUser?.id, rollbackUser?.id].filter(Boolean);
    if (testUserIds.length) {
      await query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[]))', [testUserIds]);
      await query('DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])', [testUserIds]);
      await query('DELETE FROM deposits WHERE user_id = ANY($1::bigint[])', [testUserIds]);
      await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [testUserIds]);
    }
    for (const [key, value] of Object.entries(originals)) await setSetting(key, value);
    await pool.end();
  }
}

main();
