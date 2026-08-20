const { withTransaction, query } = require('../db/pool');
const { tonToDZX, postEconomyTransactionOnClient } = require('./economy-service');

function positiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const n = Number(result.rows[0].value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function settingBoolean(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const value = result.rows[0].value;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  return fallback;
}

async function getDepositSettings() {
  const result = await query(
    `SELECT key, value
     FROM admin_settings
     WHERE key LIKE 'deposit.%'
     ORDER BY key`
  );
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

function assertTxHash(txHash) {
  if (typeof txHash !== 'string' || txHash.trim().length < 16 || txHash.trim().length > 200) {
    throw new Error('txHash must be a valid non-empty blockchain transaction reference');
  }
  return txHash.trim();
}

async function creditConfirmedDeposit(client, deposit, confirmationCount, extraMetadata = {}) {
  return postEconomyTransactionOnClient(client, {
    idempotencyKey: `deposit:${deposit.id}`,
    userId: deposit.user_id,
    type: 'DEPOSIT',
    metadata: {
      source: 'deposit',
      deposit_id: deposit.id,
      blockchain: deposit.blockchain,
      tx_hash: deposit.tx_hash,
      ton_amount: Number(deposit.ton_amount),
      dzx_amount: Number(deposit.dzx_amount),
      confirmation_count: confirmationCount,
      required_confirmations: Number(deposit.required_confirmations),
      ...extraMetadata,
    },
    movements: [{ currency: 'DZX', amount: Number(deposit.dzx_amount), source: 'deposit' }],
  });
}

/**
 * Record a blockchain deposit observation. Funds are credited only when the
 * supplied confirmation count reaches the configured threshold.
 * The blockchain adapter is responsible for supplying a verified tx hash,
 * amount, and confirmation count; this service never pretends to query TON.
 */
async function processDeposit({
  idempotencyKey,
  userId,
  txHash,
  tonAmount,
  confirmationCount = 0,
  metadata = {},
}) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!userId) throw new Error('userId is required');
  const hash = assertTxHash(txHash);
  const amount = positiveNumber(tonAmount, 'tonAmount');
  const confirmations = Number(confirmationCount);
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error('confirmationCount must be a non-negative integer');
  }

  return withTransaction(async client => {
    const enabled = await settingBoolean(client, 'deposit.enabled', true);
    if (!enabled) throw new Error('Deposits are disabled');

    const requiredConfirmations = Math.floor(await settingNumber(client, 'deposit.required_confirmations', 1));
    const dzxAmount = tonToDZX(amount);
    const confirmed = confirmations >= requiredConfirmations;
    const status = confirmed ? 'CONFIRMED' : 'PENDING';

    const inserted = await client.query(
      `INSERT INTO deposits
         (idempotency_key, user_id, blockchain, tx_hash, ton_amount, dzx_amount,
          confirmation_count, required_confirmations, status, metadata, confirmed_at)
       VALUES ($1,$2,'TON',$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        idempotencyKey,
        userId,
        hash,
        amount,
        dzxAmount,
        confirmations,
        requiredConfirmations,
        status,
        { ...metadata, source: 'deposit' },
        confirmed ? new Date() : null,
      ]
    );

    if (!inserted.rowCount) {
      const existing = await client.query(
        'SELECT * FROM deposits WHERE idempotency_key = $1 FOR SHARE',
        [idempotencyKey]
      );
      if (!existing.rowCount) throw new Error('Unable to resolve idempotent deposit');
      const previous = existing.rows[0];
      if (
        Number(previous.user_id) !== Number(userId)
        || previous.tx_hash !== hash
        || Number(previous.ton_amount) !== amount
      ) {
        throw new Error('Idempotency key was already used with different deposit data');
      }
      return { deposit: previous, duplicate: true, credited: previous.status === 'CONFIRMED' };
    }

    const deposit = inserted.rows[0];
    if (!confirmed) return { deposit, duplicate: false, credited: false };

    const economy = await creditConfirmedDeposit(client, deposit, confirmations);
    return { deposit, economy, duplicate: false, credited: true };
  });
}

async function confirmDeposit({ idempotencyKey, confirmationCount, metadata = {} }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  const confirmations = Number(confirmationCount);
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error('confirmationCount must be a non-negative integer');
  }

  return withTransaction(async client => {
    const row = await client.query(
      `SELECT * FROM deposits WHERE idempotency_key = $1 FOR UPDATE`,
      [idempotencyKey]
    );
    if (!row.rowCount) throw new Error('Deposit not found');

    const deposit = row.rows[0];
    if (deposit.status === 'REJECTED') throw new Error('Rejected deposit cannot be confirmed');
    if (deposit.status === 'CONFIRMED') return { deposit, duplicate: true, credited: true };

    const requiredConfirmations = Number(deposit.required_confirmations);
    if (confirmations < requiredConfirmations) {
      const updated = await client.query(
        `UPDATE deposits
         SET confirmation_count = $1,
             metadata = metadata || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [confirmations, JSON.stringify(metadata), deposit.id]
      );
      return { deposit: updated.rows[0], duplicate: false, credited: false };
    }

    const updated = await client.query(
      `UPDATE deposits
       SET confirmation_count = $1,
           status = 'CONFIRMED',
           confirmed_at = NOW(),
           metadata = metadata || $2::jsonb,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [confirmations, JSON.stringify(metadata), deposit.id]
    );

    const confirmedDeposit = updated.rows[0];
    const economy = await creditConfirmedDeposit(client, confirmedDeposit, confirmations, metadata);
    return { deposit: confirmedDeposit, economy, duplicate: false, credited: true };
  });
}

async function getDepositByIdempotencyKey(idempotencyKey) {
  const result = await query('SELECT * FROM deposits WHERE idempotency_key = $1', [idempotencyKey]);
  return result.rows[0] || null;
}

async function getDepositByTxHash(txHash) {
  const result = await query('SELECT * FROM deposits WHERE tx_hash = $1', [assertTxHash(txHash)]);
  return result.rows[0] || null;
}

module.exports = {
  getDepositSettings,
  processDeposit,
  confirmDeposit,
  getDepositByIdempotencyKey,
  getDepositByTxHash,
};
