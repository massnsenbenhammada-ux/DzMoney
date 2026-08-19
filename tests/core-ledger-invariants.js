/**
 * Static/contract checks for the Phase 1 financial foundation.
 *
 * These checks intentionally do not connect to production or any real database.
 * They verify that the service exposes the expected safety contract before
 * database integration tests are introduced.
 */

const assert = require('assert');
const ledger = require('../services/ledger-service');
const economy = require('../services/economy-service');

assert.deepStrictEqual(ledger.CURRENCIES, { COINS: 'COINS', BUX: 'BUX' });
assert.strictEqual(ledger.ENTRY_TYPES.TASK_REWARD, 'TASK_REWARD');
assert.strictEqual(ledger.ENTRY_TYPES.WITHDRAWAL_DEBIT, 'WITHDRAWAL_DEBIT');
assert.strictEqual(typeof ledger.credit, 'function');
assert.strictEqual(typeof ledger.debit, 'function');
assert.strictEqual(typeof economy.withTransaction, 'function');

assert.throws(
  () => ledger.credit({ query: async () => ({}) }, {
    userId: 123,
    currency: 'BUX',
    amount: 1,
    entryType: 'TASK_REWARD',
    idempotencyKey: 'test'
  }),
  /userId must be a non-empty string/
);

assert.throws(
  () => ledger.credit({ query: async () => ({}) }, {
    userId: 'user-1',
    currency: 'INVALID',
    amount: 1,
    entryType: 'TASK_REWARD',
    idempotencyKey: 'test'
  }),
  /Unsupported currency/
);

assert.throws(
  () => ledger.credit({ query: async () => ({}) }, {
    userId: 'user-1',
    currency: 'BUX',
    amount: 0,
    entryType: 'TASK_REWARD',
    idempotencyKey: 'test'
  }),
  /amount must be a positive safe integer/
);

assert.throws(
  () => ledger.credit({ query: async () => ({}) }, {
    userId: 'user-1',
    currency: 'BUX',
    amount: 1,
    entryType: 'TASK_REWARD'
  }),
  /idempotencyKey is required/
);

console.log('core-ledger-invariants: PASS');
