const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../src/db/pool');
const { createUser } = require('../src/services/wallet-service');
const { postEconomyTransaction } = require('../src/services/economy-service');

async function main() {
  let userA;
  let userB;
  const marker = `economy-idempotency-ownership-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sharedKey = `${marker}:shared`;

  try {
    userA = await createUser({
      telegramUserId: `9${Date.now()}01`,
      username: `${marker}-a`,
      firstName: 'Economy Idempotency A'
    });
    userB = await createUser({
      telegramUserId: `9${Date.now()}02`,
      username: `${marker}-b`,
      firstName: 'Economy Idempotency B'
    });

    const first = await postEconomyTransaction({
      idempotencyKey: sharedKey,
      userId: userA.id,
      type: 'TEST_CREDIT',
      metadata: { source: marker },
      movements: [{ currency: 'DZX', amount: 10, source: 'test' }]
    });
    assert.equal(first.duplicate, false);

    const sameOwnerRetry = await postEconomyTransaction({
      idempotencyKey: sharedKey,
      userId: userA.id,
      type: 'TEST_CREDIT',
      metadata: { source: marker },
      movements: [{ currency: 'DZX', amount: 10, source: 'test' }]
    });
    assert.equal(sameOwnerRetry.duplicate, true);
    assert.equal(String(sameOwnerRetry.transaction.user_id), String(userA.id));

    await assert.rejects(
      () => postEconomyTransaction({
        idempotencyKey: sharedKey,
        userId: userB.id,
        type: 'TEST_CREDIT',
        metadata: { source: marker },
        movements: [{ currency: 'DZX', amount: 10, source: 'test' }]
      }),
      /idempotency.*owner|idempotency.*user|ownership/i
    );

    await assert.rejects(
      () => postEconomyTransaction({
        idempotencyKey: sharedKey,
        userId: userA.id,
        type: 'DIFFERENT_TEST_OPERATION',
        metadata: { source: marker },
        movements: [{ currency: 'DZX', amount: 10, source: 'test' }]
      }),
      /idempotency.*type|operation|mismatch/i
    );

    const balances = await pool.query(
      `SELECT user_id, balance
       FROM wallet_accounts
       WHERE user_id = ANY($1::bigint[]) AND currency = 'DZX'
       ORDER BY user_id`,
      [[userA.id, userB.id]]
    );
    const byUser = Object.fromEntries(balances.rows.map(row => [String(row.user_id), Number(row.balance)]));
    assert.equal(byUser[String(userA.id)], 10);
    assert.equal(byUser[String(userB.id)], 0);

    console.log('Economy idempotency ownership invariants: PASS');
  } catch (error) {
    console.error('Economy idempotency ownership invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    const userIds = [userA?.id, userB?.id].filter(Boolean);
    if (userIds.length) {
      await withTransaction(async client => {
        await client.query(
          `DELETE FROM ledger_entries
           WHERE transaction_id IN (
             SELECT id FROM ledger_transactions WHERE user_id = ANY($1::bigint[])
           )`,
          [userIds]
        );
        await client.query(
          'DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])',
          [userIds]
        );
        await client.query(
          'DELETE FROM users WHERE id = ANY($1::bigint[])',
          [userIds]
        );
      });
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Economy idempotency ownership runner: FAIL');
  console.error(error);
  process.exit(1);
});
