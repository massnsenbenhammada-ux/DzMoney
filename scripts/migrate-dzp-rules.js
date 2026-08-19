const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // DZP is intentionally kept separate from Coins and DZX.
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dzp BIGINT NOT NULL DEFAULT 0;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dzp_activity_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        amount NUMERIC(30,8) NOT NULL CHECK (amount >= 0),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, source_type, source_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dzp_activity_user_created
      ON dzp_activity_ledger(user_id, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_dzp_rewards (
        id BIGSERIAL PRIMARY KEY,
        referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(30,8) NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL DEFAULT 'granted',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dzp_settings (
        key TEXT PRIMARY KEY,
        value NUMERIC(30,8) NOT NULL CHECK (value >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO dzp_settings(key, value) VALUES
        ('referral_dzp_reward', 0),
        ('default_activity_dzp', 0)
      ON CONFLICT (key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('DZP rules migration: OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DZP rules migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
