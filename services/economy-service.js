const ledger = require('./ledger-service');

/**
 * Single entry point for application-level money movements.
 * Business features should call this service rather than changing balances directly.
 */

function assertUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId must be a non-empty string');
  }
}

async function credit({ client, userId, currency, amount, entryType, referenceType, referenceId, idempotencyKey, metadata }) {
  if (!client) throw new Error('database client is required');
  assertUserId(userId);
  return ledger.credit(client, {
    userId,
    currency,
    amount,
    entryType,
    referenceType,
    referenceId,
    idempotencyKey,
    metadata
  });
}

async function debit({ client, userId, currency, amount, entryType, referenceType, referenceId, idempotencyKey, metadata }) {
  if (!client) throw new Error('database client is required');
  assertUserId(userId);
  return ledger.debit(client, {
    userId,
    currency,
    amount,
    entryType,
    referenceType,
    referenceId,
    idempotencyKey,
    metadata
  });
}

async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  credit,
  debit,
  withTransaction,
  CURRENCIES: ledger.CURRENCIES,
  ENTRY_TYPES: ledger.ENTRY_TYPES
};
