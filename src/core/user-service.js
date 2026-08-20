const { withTransaction } = require('../db/pool');

const CURRENCIES = ['COIN', 'DZX', 'DZP', 'TON'];

async function upsertTelegramUser({ telegramUserId, username = null, firstName = null, lastName = null, photoUrl = null }) {
  if (!telegramUserId) throw new Error('telegramUserId is required');

  return withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (telegram_user_id, username, first_name, last_name, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         photo_url = EXCLUDED.photo_url,
         updated_at = now()
       RETURNING id, telegram_user_id, username, first_name, last_name, photo_url, role, status`,
      [telegramUserId, username, firstName, lastName, photoUrl]
    );

    const user = userResult.rows[0];
    for (const currency of CURRENCIES) {
      await client.query(
        `INSERT INTO wallet_accounts (user_id, currency)
         VALUES ($1, $2)
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [user.id, currency]
      );
    }
    return user;
  });
}

async function getUserWallets(userId) {
  const { getPool } = require('../db/pool');
  const result = await getPool().query(
    `SELECT currency, balance, earned_balance, purchased_balance, updated_at
     FROM wallet_accounts
     WHERE user_id = $1
     ORDER BY CASE currency WHEN 'COIN' THEN 1 WHEN 'DZX' THEN 2 WHEN 'DZP' THEN 3 WHEN 'TON' THEN 4 END`,
    [userId]
  );
  return result.rows;
}

module.exports = { upsertTelegramUser, getUserWallets };
