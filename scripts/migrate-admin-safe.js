"use strict";

const { Pool } = require("pg");

/**
 * Safe Admin/runtime migration.
 * - Never deletes data.
 * - Never renames legacy columns.
 * - Creates the settings keys used by the canonical Admin Panel.
 * - Mirrors compatibility values into economy_settings/dzp_settings.
 * - Is idempotent and safe to run on every deploy.
 */

const defaults = {
  daily_reward_coins: "1000",
  daily_reward_bux: "1",
  minimum_withdraw_bux: "2000",
  withdrawal_fee_bux: "0",
  daily_ads_limit: "20",
  daily_reward_ad_separate: "true",
  referral_percentage: "20",
  system_enabled: "true",
  dzp_default_activity: "0",
  dzp_ad_reward: "0",
  dzp_referral_reward: "0",
  dzx_per_ton: "10000",
  coins_per_dzx: "100",
  coins_per_ton: "1000000",
  minimum_deposit_ton: "1",
  minimum_withdrawal_ton: "0.2",
  minimum_withdrawal_coins: "2000000",
  withdrawal_fee_dzx: "0",
  squad_activity_threshold_percent: "50",
  squad_max_bonus_percent: "100",
  daily_ad_task_count: "20",
  daily_task_reward_coins: "1000",
  daily_task_reward_dzx: "1",
  adsgram_block_id: "43650",
  updates_channel_url: ""
};

const mirrors = {
  dzx_per_ton: "dzx_per_ton",
  coins_per_dzx: "coins_per_dzx",
  coins_per_ton: "coins_per_ton",
  minimum_deposit_ton: "minimum_deposit_ton",
  minimum_withdrawal_ton: "minimum_withdrawal_ton",
  minimum_withdrawal_coins: "minimum_withdrawal_coins",
  withdrawal_fee_dzx: "withdrawal_fee_dzx",
  referral_percentage: "referral_percentage",
  squad_activity_threshold_percent: "squad_activity_threshold_percent",
  squad_max_bonus_percent: "squad_max_bonus_percent",
  daily_ad_task_count: "daily_ad_task_count",
  daily_task_reward_coins: "daily_task_reward_coins",
  daily_task_reward_dzx: "daily_task_reward_dzx",
  adsgram_block_id: "adsgram_block_id",
  updates_channel_url: "updates_channel_url"
};

const dzpMirrors = {
  dzp_default_activity: "default_activity_dzp",
  dzp_ad_reward: "ad_dzp_reward",
  dzp_referral_reward: "referral_dzp_reward"
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dzp_settings (
        key TEXT PRIMARY KEY,
        value NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS admin_audit (
        id BIGSERIAL PRIMARY KEY,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC);
    `);

    const now = Date.now();
    for (const [key, value] of Object.entries(defaults)) {
      await client.query(
        `INSERT INTO settings(key,value,updated_at)
         VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING`,
        [key, value, now]
      );
      if (mirrors[key]) {
        await client.query(
          `INSERT INTO economy_settings(key,value,updated_at)
           VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING`,
          [mirrors[key], value, now]
        );
      }
      if (dzpMirrors[key]) {
        await client.query(
          `INSERT INTO dzp_settings(key,value,updated_at)
           VALUES($1,$2,NOW()) ON CONFLICT(key) DO NOTHING`,
          [dzpMirrors[key], value]
        );
      }
    }

    // Keep the derived COIN/TON value mathematically consistent without
    // overwriting a value chosen by the administrator's two primary rates.
    const rates = await client.query(
      `SELECT key,value FROM settings WHERE key IN ('dzx_per_ton','coins_per_dzx')`
    );
    const rateMap = Object.fromEntries(rates.rows.map(row => [row.key, row.value]));
    const derived = Number(rateMap.dzx_per_ton || 10000) * Number(rateMap.coins_per_dzx || 100);
    if (Number.isFinite(derived) && derived > 0) {
      await client.query(
        `INSERT INTO settings(key,value,updated_at) VALUES('coins_per_ton',$1,$2)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [String(derived), now]
      );
      await client.query(
        `INSERT INTO economy_settings(key,value,updated_at) VALUES('coins_per_ton',$1,$2)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [String(derived), now]
      );
    }

    await client.query("COMMIT");
    console.log("Admin safe migration: OK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin safe migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("Admin safe migration fatal error:", error);
  process.exitCode = 1;
});
