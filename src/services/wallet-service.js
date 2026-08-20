const { query, withTransaction } = require('../db/pool');

const CURRENCIES = ['COIN', 'DZX', 'DZP', 'TON'];

async function ensureWallets(client, userId) {
  for (const currency of CURRENCIES) {
    await client.query(
      `INSERT INTO wallet_accounts (user_id, currency)
       VALUES ($1, $2)
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [userId, currency]
    );
  }
}

async function createUser({ telegramUserId, username = null, firstName = null, photoUrl = null }) {
  return withTransaction(async client => {
    const result = await client.query(
      `INSERT INTO users (telegram_user_id, username, first_name, photo_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_user_id)
       DO UPDATE SET username = EXCLUDED.username,
                     first_name = EXCLUDED.first_name,
                     photo_url = EXCLUDED.photo_url,
                     updated_at = NOW()
       RETURNING *`,
      [telegramUserId, username, firstName, photoUrl]
    );
    const user = result.rows[0];
    await ensureWallets(client, user.id);
    return user;
  });
}

async function getUserWallets(userId) {
  const result = await query(
    `SELECT currency, balance, earned_dzp, purchased_dzp
     FROM wallet_accounts
     WHERE user_id = $1
     ORDER BY currency`,
    [userId]
  );
  return result.rows;
}

async function getBalance(userId, currency) {
  if (!CURRENCIES.includes(currency)) throw new Error('Unsupported currency');
  const result = await query(
    'SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = $2',
    [userId, currency]
  );
  return result.rows[0] || null;
}

module.exports = { CURRENCIES, createUser, getUserWallets, getBalance };
