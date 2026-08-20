const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient, TON_DZX } = require('./economy-service');

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

async function expireStalePendingDeposits(client, userId, timeoutHours) {
  await client.query(
    `UPDATE deposits
     SET status = 'REJECTED',
         metadata = metadata || jsonb_build_object(
           'rejection_reason', 'PENDING_TIMEOUT',
           'rejected_at', NOW()
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND status = 'PENDING'
       AND created_at <= NOW() - ($2::numeric * INTERVAL '1 hour')`,
    [userId, timeoutHours]
  );
}

async function reserveDailyDepositQuota(client, userId, tonAmount) {
  const limit = await settingNumber(client, 'deposit.daily_limit_ton', 10);

  // A single per-user/per-day row is the serialization point for the quota.
  // The conditional UPDATE is atomic under PostgreSQL row locking, so two
  // concurrent confirmations cannot both consume the same remaining quota.
  await client.query(
    `INSERT INTO deposit_daily_usage (user_id, usage_date, ton_used)
     VALUES ($1, CURRENT_DATE, 0)
     ON CONFLICT (user_id, usage_date) DO NOTHING`,
    [userId]
  );

  const result = await client.query(
    `UPDATE deposit_daily_usage
     SET ton_used = ton_used + $2,
         updated_at = NOW()
     WHERE user_id = $1
       AND usage_date = CURRENT_DATE
       AND ton_used + $2 <= $3
     RETURNING ton_used`,
    [userId, tonAmount, limit]
  );

  if (!result.rowCount) {
    throw new Error(`Daily deposit limit exceeded: ${limit} TON`);
  }

  const used = Number(result.rows[0].ton_used);
  return { limit, used, remaining: Math.max(0, limit - used) };
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

async function calculateDZX(client, tonAmount) {
  const rate = await settingNumber(client, 'economy.dzx_per_ton', TON_DZX);
  return { rate, dzxAmount: tonAmount * rate };
}

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

    const timeoutHours = await settingNumber(client, 'deposit.pending_timeout_hours', 24);
    await expireStalePendingDeposits(client, userId, timeoutHours);

    const existingTx = await client.query('SELECT * FROM deposits WHERE tx_hash = $1 FOR SHARE', [hash]);
    if (existingTx.rowCount) {
      const previous = existingTx.rows[0];
      if (previous.idempotency_key !== idempotencyKey) {
        throw new Error('Blockchain transaction has already been recorded');
      }
    }

    const requiredConfirmations = Math.floor(await settingNumber(client, 'deposit.required_confirmations', 1));
    const { rate, dzxAmount } = await calculateDZX(client, amount);
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
        { ...metadata, source: 'deposit', rate_dzx_per_ton: rate },
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

    await reserveDailyDepositQuota(client, userId, amount);
    const economy = await creditConfirmedDeposit(client, deposit, confirmations, { rate_dzx_per_ton: rate });
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
    const timeoutHours = await settingNumber(client, 'deposit.pending_timeout_hours', 24);

    if (deposit.status === 'REJECTED') throw new Error('Rejected deposit cannot be confirmed');
    if (deposit.status === 'CONFIRMED') return { deposit, duplicate: true, credited: true };

    const ageExpired = new Date(deposit.created_at).getTime() <= Date.now() - timeoutHours * 60 * 60 * 1000;
    if (ageExpired) {
      const rejected = await client.query(
        `UPDATE deposits
         SET status = 'REJECTED',
             metadata = metadata || jsonb_build_object(
               'rejection_reason', 'PENDING_TIMEOUT',
               'rejected_at', NOW()
             ),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [deposit.id]
      );
      return { deposit: rejected.rows[0], duplicate: false, credited: false, expired: true };
    }

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

    await reserveDailyDepositQuota(client, deposit.user_id, Number(deposit.ton_amount));
    const economy = await creditConfirmedDeposit(client, deposit, confirmations, metadata);
    const updated = await client.query(
      `UPDATE deposits
       SET status = 'CONFIRMED',
           confirmation_count = $1,
           confirmed_at = NOW(),
           metadata = metadata || $2::jsonb,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [confirmations, JSON.stringify(metadata), deposit.id]
    );
    return { deposit: updated.rows[0], economy, duplicate: false, credited: true };
  });
}

async function getDepositByTxHash(txHash) {
  const result = await query('SELECT * FROM deposits WHERE tx_hash = $1', [assertTxHash(txHash)]);
  return result.rows[0] || null;
}

module.exports = {
  getDepositSettings,
  processDeposit,
  confirmDeposit,
  getDepositByTxHash,
};
