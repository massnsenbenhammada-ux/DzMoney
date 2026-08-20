const { getPool, withTransaction } = require('../db/pool');

const CURRENCIES = ['COIN', 'DZX', 'DZP', 'TON'];

async function ensureWallets(userId, client = null) {
  if (!userId) throw new Error('userId is required');
  const run = async (db) => {
    for (const currency of CURRENCIES) {
      await db.query(
        `INSERT INTO wallet_accounts (user_id, currency)
         VALUES ($1, $2)
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [userId, currency]
      );
    }
  };
  return client ? run(client) : withTransaction(run);
}

async function getWallet(userId, currency) {
  const result = await getPool().query(
    `SELECT id, user_id, currency, balance, earned_balance, purchased_balance, created_at, updated_at
     FROM wallet_accounts
     WHERE user_id = $1 AND currency = $2`,
    [userId, currency]
  );
  if (!result.rowCount) throw new Error('wallet not found');
  return result.rows[0];
}

async function getWalletSummary(userId) {
  const result = await getPool().query(
    `SELECT currency, balance, earned_balance, purchased_balance, updated_at
     FROM wallet_accounts
     WHERE user_id = $1`,
    [userId]
  );
  return Object.fromEntries(result.rows.map((row) => [row.currency, row]));
}

async function reconcileWallet(userId, currency) {
  return withTransaction(async (client) => {
    const wallet = await client.query(
      `SELECT id, balance, earned_balance, purchased_balance
       FROM wallet_accounts
       WHERE user_id = $1 AND currency = $2
       FOR UPDATE`,
      [userId, currency]
    );
    if (!wallet.rowCount) throw new Error('wallet not found');

    const ledger = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS net_change,
              COALESCE(MIN(balance_before), 0) AS first_balance_before
       FROM ledger_entries
       WHERE wallet_account_id = $1`,
      [wallet.rows[0].id]
    );

    return {
      currency,
      storedBalance: Number(wallet.rows[0].balance),
      earnedBalance: Number(wallet.rows[0].earned_balance),
      purchasedBalance: Number(wallet.rows[0].purchased_balance),
      ledgerNetChange: Number(ledger.rows[0].net_change),
      status: 'checked',
    };
  });
}

module.exports = { ensureWallets, getWallet, getWalletSummary, reconcileWallet };
