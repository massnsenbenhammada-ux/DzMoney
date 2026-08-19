"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing; DZX withdrawal migration aborted.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

(async () => {
  try {
    await pool.query("BEGIN");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_withdrawals (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL UNIQUE,
        destination TEXT NOT NULL,
        network TEXT NOT NULL DEFAULT 'testnet',
        gross_dzx NUMERIC(30,9) NOT NULL CHECK (gross_dzx > 0),
        fee_dzx NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (fee_dzx >= 0),
        net_dzx NUMERIC(30,9) NOT NULL CHECK (net_dzx > 0),
        status TEXT NOT NULL DEFAULT 'PENDING',
        failure_reason TEXT,
        external_tx_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CHECK (fee_dzx < gross_dzx),
        CHECK (net_dzx = gross_dzx - fee_dzx),
        CHECK (network = 'testnet')
      );
      CREATE INDEX IF NOT EXISTS economy_withdrawals_user_idx
        ON economy_withdrawals(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS economy_withdrawals_status_idx
        ON economy_withdrawals(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS economy_withdrawals_external_tx_uq
        ON economy_withdrawals(external_tx_id)
        WHERE external_tx_id IS NOT NULL;
    `);

    await pool.query(`
      INSERT INTO economy_settings(key,value,updated_at)
      VALUES('withdrawal_fee_dzx','0',$1)
      ON CONFLICT(key) DO NOTHING
    `, [Date.now()]);

    await pool.query("COMMIT");
    console.log("DZX withdrawal migration: OK");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("DZX withdrawal migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
