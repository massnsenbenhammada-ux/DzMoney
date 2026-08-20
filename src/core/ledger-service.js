const { withTransaction } = require('../db/pool');

const CURRENCIES = new Set(['COIN', 'DZX', 'DZP', 'TON']);
const SOURCE_CLASSES = new Set(['EARNED', 'PURCHASED', 'SYSTEM', 'DEPOSIT', 'WITHDRAWAL', 'RESERVED']);

function assertAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive safe integer');
  }
}

function assertCurrency(currency) {
  if (!CURRENCIES.has(currency)) throw new Error(`unsupported currency: ${currency}`);
}

function assertSourceClass(sourceClass) {
  if (!SOURCE_CLASSES.has(sourceClass)) throw new Error(`unsupported source class: ${sourceClass}`);
}

/**
 * Posts one atomic wallet credit/debit through the ledger.
 * All balances are locked before calculation; no client-side balance mutation is allowed.
 */
async function postEntry({
  userId,
  currency,
  amount,
  operationType,
  idempotencyKey,
  sourceClass = 'SYSTEM',
  actorUserId = userId,
  referenceType = null,
  referenceId = null,
  metadata = {},
}) {
  if (!userId) throw new Error('userId is required');
  assertCurrency(currency);
  assertAmount(Math.abs(amount));
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error('amount must be a non-zero safe integer');
  if (!operationType) throw new Error('operationType is required');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  assertSourceClass(sourceClass);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT lt.id, lt.status, le.balance_after
       FROM ledger_transactions lt
       LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
       WHERE lt.operation_type = $1 AND lt.actor_user_id = $2 AND lt.idempotency_key = $3
       ORDER BY le.created_at DESC NULLS LAST LIMIT 1`,
      [operationType, actorUserId, idempotencyKey]
    );
    if (existing.rowCount) {
      return { transactionId: existing.rows[0].id, duplicate: true, balance: existing.rows[0].balance_after };
    }

    const wallet = await client.query(
      `SELECT id, balance
       FROM wallet_accounts
       WHERE user_id = $1 AND currency = $2
       FOR UPDATE`,
      [userId, currency]
    );
    if (!wallet.rowCount) throw new Error(`wallet not found for ${currency}`);

    const before = Number(wallet.rows[0].balance);
    const after = before + amount;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('insufficient balance or unsafe balance');

    const tx = await client.query(
      `INSERT INTO ledger_transactions
        (idempotency_key, operation_type, actor_user_id, reference_type, reference_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [idempotencyKey, operationType, actorUserId, referenceType, referenceId, metadata]
    );

    await client.query(
      `INSERT INTO ledger_entries
        (transaction_id, wallet_account_id, currency, amount, balance_before, balance_after, source_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tx.rows[0].id, wallet.rows[0].id, currency, amount, before, after, sourceClass]
    );

    const bucketColumn = sourceClass === 'EARNED' ? 'earned_balance'
      : sourceClass === 'PURCHASED' ? 'purchased_balance' : null;
    if (bucketColumn) {
      await client.query(
        `UPDATE wallet_accounts
         SET balance = $1, ${bucketColumn} = ${bucketColumn} + $2, updated_at = now()
         WHERE id = $3`,
        [after, amount, wallet.rows[0].id]
      );
    } else {
      await client.query(
        `UPDATE wallet_accounts SET balance = $1, updated_at = now() WHERE id = $2`,
        [after, wallet.rows[0].id]
      );
    }

    return { transactionId: tx.rows[0].id, duplicate: false, balance: after };
  });
}

async function credit(params) {
  if (params.amount <= 0) throw new Error('credit amount must be positive');
  return postEntry(params);
}

async function debit(params) {
  if (params.amount <= 0) throw new Error('debit amount must be positive');
  return postEntry({ ...params, amount: -params.amount });
}

module.exports = { postEntry, credit, debit, CURRENCIES, SOURCE_CLASSES };
