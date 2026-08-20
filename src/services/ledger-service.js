const { withTransaction } = require('../db/pool');

const INTERNAL_CURRENCIES = ['COIN', 'DZX', 'DZP'];
const BALANCED_TYPES = new Set(['TRANSFER']);

async function postTransaction({ idempotencyKey, userId = null, type, entries, metadata = {} }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!type) throw new Error('transaction type is required');
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('entries are required');

  return withTransaction(async client => {
    const existing = await client.query(
      'SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE',
      [idempotencyKey]
    );
    if (existing.rowCount) return { transaction: existing.rows[0], duplicate: true };

    const tx = await client.query(
      `INSERT INTO ledger_transactions (idempotency_key, user_id, transaction_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [idempotencyKey, userId, type, metadata]
    );

    const transaction = tx.rows[0];
    const postedEntries = [];
    const totals = new Map();

    for (const entry of entries) {
      if (!INTERNAL_CURRENCIES.includes(entry.currency)) throw new Error('Unsupported ledger currency');
      if (!Number.isFinite(Number(entry.amount)) || Number(entry.amount) === 0) {
        throw new Error('Invalid ledger amount');
      }

      const wallet = await client.query(
        `SELECT id, currency, balance
         FROM wallet_accounts
         WHERE id = $1
         FOR UPDATE`,
        [entry.walletAccountId]
      );
      if (!wallet.rowCount) throw new Error('Wallet account not found');
      if (wallet.rows[0].currency !== entry.currency) throw new Error('Ledger currency mismatch');

      const before = Number(wallet.rows[0].balance);
      const amount = Number(entry.amount);
      const after = before + amount;
      if (after < -1e-9) throw new Error('Insufficient wallet balance');

      await client.query(
        `UPDATE wallet_accounts
         SET balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [after, entry.walletAccountId]
      );

      const row = await client.query(
        `INSERT INTO ledger_entries
           (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [transaction.id, entry.walletAccountId, amount, before, after, entry.source || null, entry.currency]
      );
      postedEntries.push(row.rows[0]);
      totals.set(entry.currency, (totals.get(entry.currency) || 0) + amount);
    }

    if (BALANCED_TYPES.has(type)) {
      for (const total of totals.values()) {
        if (Math.abs(total) > 0.000000001) throw new Error('Balanced ledger transaction must net to zero per currency');
      }
    }

    return { transaction, entries: postedEntries, duplicate: false };
  });
}

module.exports = { postTransaction, INTERNAL_CURRENCIES };
