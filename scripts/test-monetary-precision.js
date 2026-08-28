const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { creditActivityReward } = require('../src/services/economy-service');

async function main() {
  const marker = `monetary-precision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user;

  try {
    user = await createUser({
      telegramUserId: -Date.now(),
      username: marker,
      firstName: 'Monetary Precision Test',
    });

    await creditActivityReward({
      idempotencyKey: `${marker}:decimal-modifier`,
      userId: user.id,
      source: 'task',
      coin: '0.1',
      dzx: '0',
      dzp: '0',
      modifiers: [{ type: 'squad', rate: '0.1' }],
    });

    const reward = await pool.query(
      `SELECT le.amount = $2::numeric AS amount_matches
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE lt.idempotency_key = $1 AND le.currency = 'COIN'`,
      [`${marker}:decimal-modifier`, '0.11']
    );
    assert.equal(reward.rows.length, 1);
    assert.equal(reward.rows[0].amount_matches, true);

    console.log('Monetary precision invariants: PASS');
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
  console.error('Monetary precision invariants: FAIL');
  console.error(error);
  process.exit(1);
});
