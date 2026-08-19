const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function grantActivityDzp({ userId, sourceType, sourceId, amount, metadata = {} }) {
  const value = Number(amount || 0);
  if (!userId || !sourceType || !sourceId || !Number.isFinite(value) || value <= 0) return { granted: false, amount: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO dzp_activity_ledger(user_id, source_type, source_id, amount, metadata)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, source_type, source_id) DO NOTHING
       RETURNING id, amount`,
      [String(userId), sourceType, String(sourceId), value, metadata]
    );

    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { granted: false, amount: 0, duplicate: true };
    }

    // Adapt to the project's existing user balance column when available.
    await client.query(
      `UPDATE users
          SET dzp_balance = COALESCE(dzp_balance, 0) + $2
        WHERE id = $1`,
      [String(userId), value]
    );

    await client.query('COMMIT');
    return { granted: true, amount: value };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function grantReferralDzpOnce({ referrerUserId, referredUserId, amount }) {
  const value = Number(amount || 0);
  if (!referrerUserId || !referredUserId || referrerUserId === referredUserId || !Number.isFinite(value) || value <= 0) {
    return { granted: false, amount: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO referral_dzp_rewards(referrer_user_id, referred_user_id, amount)
       VALUES ($1,$2,$3)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING id`,
      [String(referrerUserId), String(referredUserId), value]
    );

    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { granted: false, amount: 0, duplicate: true };
    }

    await client.query(
      `UPDATE users SET dzp_balance = COALESCE(dzp_balance, 0) + $2 WHERE id = $1`,
      [String(referrerUserId), value]
    );
    await client.query('COMMIT');
    return { granted: true, amount: value };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { grantActivityDzp, grantReferralDzpOnce };
