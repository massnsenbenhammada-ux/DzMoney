const { query } = require("../db/pool");
const { postEconomyTransaction } = require("./economy-service");

const CURRENCIES = new Set(["COIN", "DZX", "DZP"]);
const DZP_BUCKETS = new Set(["earned_dzp", "converted_dzp", "purchased_dzp"]);

function normalizeLimit(value) {
  const limit = Number.parseInt(value, 10);
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 25;
}

function requireReason(reason) {
  const value = String(reason || "").trim();
  if (!value) throw new Error("reason is required");
  if (value.length > 500) throw new Error("reason is too long");
  return value;
}

function validateAdjustment({ currency, amount, dzpSource }) {
  if (!CURRENCIES.has(currency)) throw new Error("Unsupported currency");
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(amount || "").trim()))
    throw new Error("amount must be a valid decimal number");
  if (Number(amount) === 0) throw new Error("amount must be non-zero");
  if (currency === "DZP" && !DZP_BUCKETS.has(dzpSource))
    throw new Error("dzpSource is required for DZP adjustments");
}

async function searchUsers(search, limit = 25) {
  const value = String(search || "").trim();
  const pattern = `%${value}%`;
  const result = await query(
    `SELECT id, telegram_user_id, username, first_name, photo_url, created_at, updated_at
     FROM users
     WHERE $1 = '' OR username ILIKE $2 OR first_name ILIKE $2 OR telegram_user_id::text ILIKE $2
     ORDER BY id DESC
     LIMIT $3`,
    [value, pattern, normalizeLimit(limit)],
  );
  return result.rows.map(publicUser);
}

async function getUserProfile(userId) {
  const userResult = await query(
    `SELECT id, telegram_user_id, username, first_name, photo_url, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!userResult.rowCount) throw new Error("User not found");

  const [wallets, ledger] = await Promise.all([
    query(
      `SELECT currency, balance, earned_dzp, converted_dzp, purchased_dzp
           FROM wallet_accounts WHERE user_id = $1 ORDER BY currency`,
      [userId],
    ),
    query(
      `SELECT le.id, le.currency, le.amount, le.balance_before, le.balance_after,
                  le.source, le.created_at, lt.id AS transaction_id, lt.transaction_type,
                  lt.idempotency_key, lt.metadata
           FROM ledger_entries le
           JOIN ledger_transactions lt ON lt.id = le.transaction_id
           WHERE lt.user_id = $1
           ORDER BY le.id DESC LIMIT 50`,
      [userId],
    ),
  ]);

  return {
    user: publicUser(userResult.rows[0]),
    wallets: wallets.rows,
    ledger: ledger.rows,
  };
}

async function adjustBalance({
  userId,
  currency,
  amount,
  reason,
  dzpSource = null,
  idempotencyKey,
  actorTelegramUserId,
}) {
  validateAdjustment({ currency, amount, dzpSource });
  const normalizedReason = requireReason(reason);
  const key = String(idempotencyKey || "").trim();
  if (!key) throw new Error("idempotencyKey is required");
  if (key.length > 200) throw new Error("idempotencyKey is too long");
  if (!actorTelegramUserId) throw new Error("actorTelegramUserId is required");

  const profile = await getUserProfile(userId);
  const result = await postEconomyTransaction({
    idempotencyKey: key,
    userId: profile.user.id,
    type: "ADMIN_BALANCE_ADJUSTMENT",
    movements: [
      {
        currency,
        amount: String(amount).trim(),
        source: "admin_adjustment",
        ...(currency === "DZP" ? { dzpBucket: dzpSource } : {}),
      },
    ],
    metadata: {
      actor_telegram_user_id: String(actorTelegramUserId),
      reason: normalizedReason,
      currency,
      amount: String(amount).trim(),
      ...(currency === "DZP" ? { dzp_source: dzpSource } : {}),
    },
  });

  return { ...result, user: profile.user };
}

function publicUser(row) {
  return {
    id: String(row.id),
    telegramUserId: String(row.telegram_user_id),
    username: row.username,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  searchUsers,
  getUserProfile,
  adjustBalance,
  validateAdjustment,
  requireReason,
};
