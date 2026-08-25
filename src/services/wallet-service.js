const crypto = require('crypto');
const { query, withTransaction } = require('../db/pool');

const CURRENCIES = ['COIN', 'DZX', 'DZP'];
const REFERRAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateReferralCode() {
  let code = '';
  const bytes = crypto.randomBytes(10);
  for (const byte of bytes) code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
  return code;
}

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

/** Creates or updates a Telegram user while preserving the immutable referral code. */
async function createUser({ telegramUserId, username = null, firstName = null, photoUrl = null }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withTransaction(async client => {
        const result = await client.query(
          `INSERT INTO users (telegram_user_id, username, first_name, photo_url, referral_code)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (telegram_user_id)
           DO UPDATE SET username = EXCLUDED.username,
                         first_name = EXCLUDED.first_name,
                         photo_url = EXCLUDED.photo_url,
                         updated_at = NOW()
           RETURNING *`,
          [telegramUserId, username, firstName, photoUrl, generateReferralCode()]
        );
        const user = result.rows[0];
        await ensureWallets(client, user.id);
        return user;
      });
    } catch (error) {
      if (error.code !== '23505' || error.constraint !== 'idx_users_referral_code' || attempt === 2) throw error;
    }
  }
}

async function getUserWallets(userId) {
  const result = await query(
    `SELECT currency, balance, earned_dzp, converted_dzp, purchased_dzp
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

module.exports = { CURRENCIES, createUser, getUserWallets, getBalance, ensureWallets };
