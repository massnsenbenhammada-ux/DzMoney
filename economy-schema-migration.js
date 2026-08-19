"use strict";

/**
 * Non-destructive Phase 1 database migration.
 *
 * This runs before server.js and ONLY adds the new DzMoney economic columns
 * and settings. It does not delete or rename the existing BUX columns yet.
 * The legacy columns remain the compatibility source until the application
 * layer is migrated and verified.
 */

const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[economy-migration] DATABASE_URL is missing; skipping migration.");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    await pool.query("BEGIN");

    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dzp BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deposited_dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS withdrawable_dzx BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_dzx BIGINT NOT NULL DEFAULT 0;

      ALTER TABLE users
        ADD CONSTRAINT users_dzx_nonnegative CHECK (dzx >= 0) NOT VALID,
        ADD CONSTRAINT users_dzp_nonnegative CHECK (dzp >= 0) NOT VALID,
        ADD CONSTRAINT users_deposited_dzx_nonnegative CHECK (deposited_dzx >= 0) NOT VALID,
        ADD CONSTRAINT users_withdrawable_dzx_nonnegative CHECK (withdrawable_dzx >= 0) NOT VALID,
        ADD CONSTRAINT users_locked_dzx_nonnegative CHECK (locked_dzx >= 0) NOT VALID;
    `).catch(async (error) => {
      // PostgreSQL rejects duplicate constraint names. Keep the migration
      // idempotent by creating missing constraints individually.
      if (!String(error.message || "").includes("already exists")) throw error;
      for (const [name, expression] of [
        ["users_dzx_nonnegative", "dzx >= 0"],
        ["users_dzp_nonnegative", "dzp >= 0"],
        ["users_deposited_dzx_nonnegative", "deposited_dzx >= 0"],
        ["users_withdrawable_dzx_nonnegative", "withdrawable_dzx >= 0"],
        ["users_locked_dzx_nonnegative", "locked_dzx >= 0"]
      ]) {
        await pool.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
              ALTER TABLE users ADD CONSTRAINT ${name} CHECK (${expression}) NOT VALID;
            END IF;
          END $$;
        `);
      }
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset TEXT NOT NULL CHECK (asset IN ('DZX','DZP','COINS')),
        amount NUMERIC(30,9) NOT NULL,
        entry_type TEXT NOT NULL,
        reference_type TEXT NOT NULL DEFAULT '',
        reference_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'posted',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS economy_ledger_user_idx
        ON economy_ledger(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS economy_ledger_reference_idx
        ON economy_ledger(reference_type, reference_id);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    const settings = [
      ["dzx_per_ton", "10000"],
      ["minimum_deposit_ton", "1"],
      ["minimum_withdrawal_ton", "0.2"],
      ["minimum_withdrawal_coins", "2000000"],
      ["referral_percent", "20"],
      ["squad_activity_threshold_percent", "50"],
      ["squad_max_bonus_percent", "100"]
    ];

    for (const [key, value] of settings) {
      await pool.query(
        `INSERT INTO economy_settings (key,value,updated_at)
         VALUES ($1,$2,$3)
         ON CONFLICT (key) DO NOTHING`,
        [key, value, Date.now()]
      );
    }

    // One-time safe bootstrap: if the new DZX balance is still zero and the
    // legacy BUX balance exists, copy it for compatibility. We do not delete
    // or alter the legacy BUX value.
    await pool.query(`
      UPDATE users
      SET dzx = bux
      WHERE COALESCE(dzx, 0) = 0 AND COALESCE(bux, 0) > 0;
    `);

    await pool.query("COMMIT");
    console.log("[economy-migration] DzMoney economic schema ready.");
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("[economy-migration] Failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
