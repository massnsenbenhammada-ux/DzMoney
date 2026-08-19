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

    // Keep the legacy BUX columns untouched during the migration. New DZX
    // columns are introduced first so existing production balances remain safe.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dzp BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deposited_dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS withdrawable_dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_dzx BIGINT NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset TEXT NOT NULL CHECK (asset IN ('DZX','DZP','COINS')),
        direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
        amount BIGINT NOT NULL CHECK (amount > 0),
        balance_bucket TEXT NOT NULL DEFAULT 'available',
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL
      );
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

    // Explicitly keep non-negative invariants on the new DZX/DZP buckets.
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
    console.log("Economic migration: OK (DZX/DZP/ledger/settings ready; legacy BUX preserved)");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("Economic migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
