const crypto = require('crypto');

const CURRENCIES = Object.freeze({ COINS: 'COINS', BUX: 'BUX' });

const ENTRY_TYPES = Object.freeze({
  DAILY_REWARD: 'DAILY_REWARD',
  TASK_REWARD: 'TASK_REWARD',
  AD_REWARD: 'AD_REWARD',
  REFERRAL_REWARD: 'REFERRAL_REWARD',
  SQUAD_REWARD: 'SQUAD_REWARD',
  ADMIN_CREDIT: 'ADMIN_CREDIT',
  ADMIN_DEBIT: 'ADMIN_DEBIT',
  WITHDRAWAL_LOCK: 'WITHDRAWAL_LOCK',
  WITHDRAWAL_RELEASE: 'WITHDRAWAL_RELEASE',
  WITHDRAWAL_DEBIT: 'WITHDRAWAL_DEBIT',
  REVERSAL: 'REVERSAL',
  SYSTEM_ADJUSTMENT: 'SYSTEM_ADJUSTMENT'
});

function assertUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId must be a non-empty string');
  }
}

function assertPositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
}

function assertAmount(value) {
  assertPositiveInteger(value, 'amount');
}

function assertCurrency(currency) {
  if (!Object.values(CURRENCIES).includes(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

function assertEntryType(type) {
  if (!Object.values(ENTRY_TYPES).includes(type)) {
    throw new Error(`Unsupported ledger entry type: ${type}`);
  }
}

function newIdempotencyKey(prefix = 'op') {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function getOrCreateBalance(client, userId, currency) {
  const existing = await client.query(
    `SELECT user_id, currency, available_amount, locked_amount
       FROM wallet_balances
      WHERE user_id = $1 AND currency = $2
      FOR UPDATE`,
    [userId, currency]
  );
  if (existing.rowCount) return existing.rows[0];

  await client.query(
    `INSERT INTO wallet_balances (user_id, currency, available_amount, locked_amount)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (user_id, currency) DO NOTHING`,
    [userId, currency]
  );

  const created = await client.query(
    `SELECT user_id, currency, available_amount, locked_amount
       FROM wallet_balances
      WHERE user_id = $1 AND currency = $2
      FOR UPDATE`,
    [userId, currency]
  );
  if (!created.rowCount) throw new Error('Unable to initialize wallet balance');
  return created.rows[0];
}

async function findIdempotentResult(client, userId, operation, key) {
  const result = await client.query(
    `SELECT id, status, response_body
       FROM idempotency_keys
      WHERE user_id = $1 AND operation = $2 AND key = $3
      FOR UPDATE`,
    [userId, operation, key]
  );
  return result.rowCount ? result.rows[0] : null;
}

async function beginIdempotency(client, userId, operation, key) {
  const existing = await findIdempotentResult(client, userId, operation, key);
  if (existing) return { existing, created: false };

  const inserted = await client.query(
    `INSERT INTO idempotency_keys (user_id, operation, key, status)
     VALUES ($1, $2, $3, 'PROCESSING')
     ON CONFLICT (user_id, operation, key) DO NOTHING
     RETURNING id, status, response_body`,
    [userId, operation, key]
  );
  if (inserted.rowCount) return { existing: inserted.rows[0], created: true };

  const raced = await findIdempotentResult(client, userId, operation, key);
  if (!raced) throw new Error('Unable to establish idempotency state');
  return { existing: raced, created: false };
}

async function finishIdempotency(client, userId, operation, key, result) {
  await client.query(
    `UPDATE idempotency_keys
        SET status = 'SUCCEEDED', response_body = $4, completed_at = NOW()
      WHERE user_id = $1 AND operation = $2 AND key = $3`,
    [userId, operation, key, result]
  );
}

async function credit(client, {
  userId, currency, amount, entryType,
  referenceType = null, referenceId = null,
  idempotencyKey, metadata = {}
}) {
  assertUserId(userId);
  assertCurrency(currency);
  assertAmount(amount);
  assertEntryType(entryType);
  if (!idempotencyKey) throw new Error('idempotencyKey is required');

  const idem = await beginIdempotency(client, userId, entryType, idempotencyKey);
  if (!idem.created) {
    if (idem.existing.status === 'PROCESSING') throw new Error('IDEMPOTENCY_OPERATION_IN_PROGRESS');
    return idem.existing.response_body;
  }

  const balance = await getOrCreateBalance(client, userId, currency);
  const before = Number(balance.available_amount);
  const after = before + amount;

  const ledger = await client.query(
    `INSERT INTO ledger_entries
      (user_id, currency, amount, balance_before, balance_after,
       entry_type, reference_type, reference_id, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, user_id, currency, amount, balance_before, balance_after,
               entry_type, reference_type, reference_id, idempotency_key, created_at`,
    [userId, currency, amount, before, after, entryType,
      referenceType, referenceId, idempotencyKey, JSON.stringify(metadata)]
  );

  await client.query(
    `UPDATE wallet_balances
        SET available_amount = $3, updated_at = NOW()
      WHERE user_id = $1 AND currency = $2`,
    [userId, currency, after]
  );

  const result = ledger.rows[0];
  await finishIdempotency(client, userId, entryType, idempotencyKey, result);
  return result;
}

async function debit(client, {
  userId, currency, amount, entryType,
  referenceType = null, referenceId = null,
  idempotencyKey, metadata = {}
}) {
  assertUserId(userId);
  assertCurrency(currency);
  assertAmount(amount);
  assertEntryType(entryType);
  if (!idempotencyKey) throw new Error('idempotencyKey is required');

  const idem = await beginIdempotency(client, userId, entryType, idempotencyKey);
  if (!idem.created) {
    if (idem.existing.status === 'PROCESSING') throw new Error('IDEMPOTENCY_OPERATION_IN_PROGRESS');
    return idem.existing.response_body;
  }

  const balance = await getOrCreateBalance(client, userId, currency);
  const before = Number(balance.available_amount);
  if (before < amount) throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
  const after = before - amount;

  const ledger = await client.query(
    `INSERT INTO ledger_entries
      (user_id, currency, amount, balance_before, balance_after,
       entry_type, reference_type, reference_id, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, user_id, currency, amount, balance_before, balance_after,
               entry_type, reference_type, reference_id, idempotency_key, created_at`,
    [userId, currency, -amount, before, after, entryType,
      referenceType, referenceId, idempotencyKey, JSON.stringify(metadata)]
  );

  await client.query(
    `UPDATE wallet_balances
        SET available_amount = $3, updated_at = NOW()
      WHERE user_id = $1 AND currency = $2`,
    [userId, currency, after]
  );

  const result = ledger.rows[0];
  await finishIdempotency(client, userId, entryType, idempotencyKey, result);
  return result;
}

module.exports = { CURRENCIES, ENTRY_TYPES, newIdempotencyKey, credit, debit };
