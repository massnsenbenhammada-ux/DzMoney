const { withTransaction } = require('../db/pool');

async function postTransaction({ idempotencyKey, userId = null, type, entries, metadata = {} }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
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
    let total = 0;
    const postedEntries = [];

    for (const entry of entries) {
      if (!Number.isFinite(Number(entry.amount)) || Number(entry.amount) === 0) {
        throw new Error('Invalid ledger amount');
      }

      const wallet = await client.query(
        `SELECT id, balance
         FROM wallet_accounts
         WHERE id = $1
         FOR UPDATE`,
        [entry.walletAccountId]
      );
      if (!wallet.rowCount) throw new Error('Wallet account not found');

      const before = Number(wallet.rows[0].balance);
      const amount = Number(entry.amount);
      const after = before + amount;
      if (after < 0) throw new Error('Insufficient wallet balance');

      await client.query(
        `UPDATE wallet_accounts
         SET balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [after, entry.walletAccountId]
      );

      const row = await client.query(
        `INSERT INTO ledger_entries
           (transaction_id, wallet_account_id, amount, balance_before, balance_after)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [transaction.id, entry.walletAccountId, amount, before, after]
      );
      postedEntries.push(row.rows[0]);
      total += amount;
    }

    if (Math.abs(total) > 0.000000001 && entries.length > 1) {
      throw new Error('Ledger transaction must balance to zero');
    }

    return { transaction, entries: postedEntries, duplicate: false };
  });
}

module.exports = { postTransaction };
