/**
 * Static/contract checks for the Phase 1 financial foundation.
 * No production database, wallet, RPC, or deployment is touched.
 */

const assert = require('assert');
const ledger = require('../services/ledger-service');
const economy = require('../services/economy-service');

async function main() {
  assert.deepStrictEqual(ledger.CURRENCIES, { COINS: 'COINS', BUX: 'BUX' });
  assert.strictEqual(ledger.ENTRY_TYPES.TASK_REWARD, 'TASK_REWARD');
  assert.strictEqual(ledger.ENTRY_TYPES.WITHDRAWAL_DEBIT, 'WITHDRAWAL_DEBIT');
  assert.strictEqual(typeof ledger.credit, 'function');
  assert.strictEqual(typeof ledger.debit, 'function');
  assert.strictEqual(typeof economy.withTransaction, 'function');

  const client = { query: async () => ({ rowCount: 0, rows: [] }) };

  await assert.rejects(
    ledger.credit(client, {
      userId: 123, currency: 'BUX', amount: 1,
      entryType: 'TASK_REWARD', idempotencyKey: 'test'
    }),
    /userId must be a non-empty string/
  );

  await assert.rejects(
    ledger.credit(client, {
      userId: 'user-1', currency: 'INVALID', amount: 1,
      entryType: 'TASK_REWARD', idempotencyKey: 'test'
    }),
    /Unsupported currency/
  );

  await assert.rejects(
    ledger.credit(client, {
      userId: 'user-1', currency: 'BUX', amount: 0,
      entryType: 'TASK_REWARD', idempotencyKey: 'test'
    }),
    /amount must be a positive safe integer/
  );

  await assert.rejects(
    ledger.credit(client, {
      userId: 'user-1', currency: 'BUX', amount: 1,
      entryType: 'TASK_REWARD'
    }),
    /idempotencyKey is required/
  );

  console.log('core-ledger-invariants: PASS');
}

main().catch((error) => {
  console.error('core-ledger-invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
