const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { creditActivityReward } = require('../src/services/economy-service');

function runReconciliation() {
  return spawnSync(process.execPath, ['scripts/reconcile-economy.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
}

async function main() {
  const marker = `phase13-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const telegramUserId = -Date.now();
  let user;

  try {
    user = await createUser({ telegramUserId, username: marker, firstName: 'Phase 13 Ledger Test' });
    await creditActivityReward({
      idempotencyKey: `${marker}:reward`,
      userId: user.id,
      source: 'advertisement',
      coin: 1000,
      dzx: 2,
      dzp: 1,
    });
    await creditActivityReward({
      idempotencyKey: `${marker}:reward-2`,
      userId: user.id,
      source: 'advertisement',
      coin: 500,
      dzx: 1,
      dzp: 1,
    });

    const derived = await query(`
      SELECT wa.currency, wa.balance, COALESCE(SUM(le.amount), 0) AS ledger_balance
      FROM wallet_accounts wa
      LEFT JOIN ledger_entries le ON le.wallet_account_id = wa.id
      WHERE wa.user_id = $1
      GROUP BY wa.id, wa.currency, wa.balance
      ORDER BY wa.currency
    `, [user.id]);

    assert.deepEqual(
      derived.rows.map(row => [row.currency, row.balance, row.ledger_balance]),
      [
        ['COIN', '1500.000000000', '1500.000000000'],
        ['DZP', '2.000000000', '2.000000000'],
        ['DZX', '3.000000000', '3.000000000'],
      ]
    );

    const continuity = await query(`
      SELECT COUNT(*)::int AS count
      FROM ledger_entries current_entry
      JOIN ledger_entries next_entry
        ON next_entry.wallet_account_id = current_entry.wallet_account_id
       AND next_entry.id > current_entry.id
      WHERE current_entry.wallet_account_id IN (
        SELECT id FROM wallet_accounts WHERE user_id = $1
      )
      AND next_entry.balance_before = current_entry.balance_after
      AND next_entry.id = (
        SELECT MIN(candidate.id)
        FROM ledger_entries candidate
        WHERE candidate.wallet_account_id = current_entry.wallet_account_id
          AND candidate.id > current_entry.id
      )
    `, [user.id]);
    const expectedContinuity = await query(`
      SELECT COALESCE(SUM(entry_count - 1), 0)::int AS count
      FROM (
        SELECT wallet_account_id, COUNT(*)::int AS entry_count
        FROM ledger_entries
        WHERE wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = $1)
        GROUP BY wallet_account_id
      ) grouped_entries
    `, [user.id]);
    assert.equal(Number(continuity.rows[0].count), Number(expectedContinuity.rows[0].count));

    const clean = runReconciliation();
    assert.equal(clean.status, 0, clean.stderr || clean.stdout);

    await query(`
      UPDATE wallet_accounts
      SET balance = balance + 1
      WHERE user_id = $1 AND currency = 'COIN'
    `, [user.id]);

    const corrupted = runReconciliation();
    assert.notEqual(corrupted.status, 0);
    assert.match(`${corrupted.stdout}\n${corrupted.stderr}`, /ledger_balance_mismatches/);

    await query(`
      UPDATE wallet_accounts wa
      SET balance = (
        SELECT COALESCE(SUM(le.amount), 0)
        FROM ledger_entries le
        WHERE le.wallet_account_id = wa.id
      )
      WHERE wa.user_id = $1
    `, [user.id]);

    const restored = runReconciliation();
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);

    console.log('Phase 13 ledger integrity: PASS');
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
  console.error('Phase 13 ledger integrity: FAIL');
  console.error(error);
  process.exit(1);
});
