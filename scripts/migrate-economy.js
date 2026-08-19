"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing; economic migration aborted.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

const settings = {
  dzx_per_ton: "10000",
  minimum_deposit_ton: "1",
  minimum_withdrawal_ton: "0.2",
  minimum_withdrawal_coins: "2000000",
  withdrawal_fee_dzx: "0",
  referral_percentage: "20",
  referral_level: "1",
  squad_activity_threshold_percent: "50",
  squad_max_bonus_percent: "100"
};

async function migrate() {
  try {
    await pool.query("BEGIN");

    // DZX uses NUMERIC so legitimate fractional rewards such as 0.2 DZX
    // (20% of a 1 DZX base reward) are represented exactly. Legacy BUX stays untouched.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dzp BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deposited_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS withdrawable_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_dzx NUMERIC(30,9) NOT NULL DEFAULT 0;
    `);

    // If a previous deployment created these columns as BIGINT, widen them safely.
    await pool.query(`
      ALTER TABLE users
        ALTER COLUMN dzx TYPE NUMERIC(30,9) USING dzx::numeric,
        ALTER COLUMN deposited_dzx TYPE NUMERIC(30,9) USING deposited_dzx::numeric,
        ALTER COLUMN withdrawable_dzx TYPE NUMERIC(30,9) USING withdrawable_dzx::numeric,
        ALTER COLUMN locked_dzx TYPE NUMERIC(30,9) USING locked_dzx::numeric;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset TEXT NOT NULL CHECK (asset IN ('DZX','DZP','COINS')),
        direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
        amount NUMERIC(30,9) NOT NULL CHECK (amount > 0),
        balance_bucket TEXT NOT NULL DEFAULT 'available',
        source_type TEXT NOT NULL DEFAULT 'SYSTEM',
        source_id TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL DEFAULT 0
      );
    `);

    await pool.query(`
      ALTER TABLE economy_ledger
        ADD COLUMN IF NOT EXISTS asset TEXT,
        ADD COLUMN IF NOT EXISTS direction TEXT,
        ADD COLUMN IF NOT EXISTS amount NUMERIC(30,9),
        ADD COLUMN IF NOT EXISTS balance_bucket TEXT NOT NULL DEFAULT 'available',
        ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'SYSTEM',
        ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE economy_ledger
        ALTER COLUMN amount TYPE NUMERIC(30,9) USING amount::numeric;
    `);

    await pool.query(`
      UPDATE economy_ledger
      SET source_type = COALESCE(NULLIF(source_type, ''), 'LEGACY'),
          source_id = COALESCE(source_id, ''),
          balance_bucket = COALESCE(balance_bucket, 'available'),
          metadata = COALESCE(metadata, '{}'::jsonb),
          created_at = COALESCE(created_at, 0)
      WHERE source_type IS NULL OR source_type = '' OR source_id IS NULL
         OR balance_bucket IS NULL OR metadata IS NULL OR created_at IS NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS economy_ledger_user_created_idx
      ON economy_ledger(user_id, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS economy_ledger_source_idx
      ON economy_ledger(source_type, source_id);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    const now = Date.now();
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO economy_settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO NOTHING`,
        [key, value, now]
      );
    }

    // Referral qualification is separate from the legacy referral balance fields.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS referral_qualified_at BIGINT,
        ADD COLUMN IF NOT EXISTS referral_lifetime_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // Hierarchical Squad data is isolated from Referral data.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS squads (
        id BIGSERIAL PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
        bonus_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (bonus_percent >= 0 AND bonus_percent <= 100),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS squads_owner_uq ON squads(owner_id);

      CREATE TABLE IF NOT EXISTS squad_members (
        squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        joined_at BIGINT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (squad_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS squad_members_parent_idx ON squad_members(squad_id, parent_user_id);
      CREATE INDEX IF NOT EXISTS squad_members_user_idx ON squad_members(user_id);

      CREATE TABLE IF NOT EXISTS squad_daily_activity (
        squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
        activity_date DATE NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 0,
        active_member_count INTEGER NOT NULL DEFAULT 0,
        required_active_count INTEGER NOT NULL DEFAULT 0,
        threshold_percent NUMERIC(6,3) NOT NULL DEFAULT 50,
        eligible_for_next_day BOOLEAN NOT NULL DEFAULT FALSE,
        calculated_at BIGINT NOT NULL,
        PRIMARY KEY (squad_id, activity_date)
      );
    `);

    // Package participation/weight data is intentionally separate from the user balance.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        duration_days INTEGER,
        price_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        weight NUMERIC(20,6) NOT NULL DEFAULT 1,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_packages (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        package_id BIGINT NOT NULL REFERENCES packages(id),
        starts_at BIGINT NOT NULL,
        expires_at BIGINT,
        weight NUMERIC(20,6) NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS user_packages_active_idx ON user_packages(user_id, status, expires_at);
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_dzx_nonnegative') THEN
          ALTER TABLE users ADD CONSTRAINT users_dzx_nonnegative CHECK (dzx >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_dzp_nonnegative') THEN
          ALTER TABLE users ADD CONSTRAINT users_dzp_nonnegative CHECK (dzp >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_deposited_dzx_nonnegative') THEN
          ALTER TABLE users ADD CONSTRAINT users_deposited_dzx_nonnegative CHECK (deposited_dzx >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_withdrawable_dzx_nonnegative') THEN
          ALTER TABLE users ADD CONSTRAINT users_withdrawable_dzx_nonnegative CHECK (withdrawable_dzx >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_locked_dzx_nonnegative') THEN
          ALTER TABLE users ADD CONSTRAINT users_locked_dzx_nonnegative CHECK (locked_dzx >= 0) NOT VALID;
        END IF;
      END $$;
    `);

    await pool.query("COMMIT");
    console.log("Economic migration: OK (DZX/DZP/referral/squad/packages ready; legacy BUX preserved)");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("Economic migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
