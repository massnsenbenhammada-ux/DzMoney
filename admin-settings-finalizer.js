"use strict";

const express = require("express");
const { Pool } = require("pg");

// Final authoritative Admin settings middleware. It runs after JSON/urlencoded
// body parsing but before the application's route handlers, so every Admin
// settings change reaches the real database/system settings source.

const currentUse = express.application.use;
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const ALLOWED = new Set([
  "daily_reward_coins", "daily_reward_bux", "minimum_withdraw_bux",
  "withdrawal_fee_bux", "daily_ads_limit", "daily_reward_ad_separate",
  "referral_percentage", "system_enabled",
  "dzp_default_activity", "dzp_ad_reward", "dzp_referral_reward",
  "dzx_per_ton", "coins_per_dzx", "coins_per_ton"
]);

const DZP_MAP = {
  dzp_default_activity: "default_activity_dzp",
  dzp_ad_reward: "ad_dzp_reward",
  dzp_referral_reward: "referral_dzp_reward"
};

function adminToken(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const value = part.trim();
    if (value.startsWith("dz_admin=")) return value.slice("dz_admin=".length);
  }
  return "";
}

async function authenticate(req, res) {
  if (!process.env.ADMIN_PASSWORD) {
    res.status(503).json({ success: false, message: "Admin panel is disabled. Set ADMIN_PASSWORD in Railway Variables." });
    return null;
  }
  if (req.headers["x-dzmoney-admin-request"] !== "1") {
    res.status(403).json({ success: false, message: "Invalid admin request." });
    return null;
  }
  const token = adminToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Admin authentication required." });
    return null;
  }
  const result = await pool.query(
    `SELECT token,admin_id,created_at,expires_at FROM admin_sessions
     WHERE token=$1 AND expires_at>$2 LIMIT 1`,
    [token, Date.now()]
  );
  if (!result.rowCount) {
    res.status(401).json({ success: false, message: "Admin authentication required." });
    return null;
  }
  return result.rows[0];
}

function validWhole(value, min = 0) {
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) >= min;
}

function validDecimal(value) {
  const text = String(value).trim();
  const n = Number(text);
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n) && n > 0;
}

async function audit(adminId, details) {
  await pool.query(
    `INSERT INTO admin_audit(admin_id,action,target_id,details,created_at)
     VALUES($1,'update_settings','',$2,$3)`,
    [adminId, details, Date.now()]
  );
}

async function handleSettings(req, res) {
  const admin = await authenticate(req, res);
  if (!admin) return;

  const values = req.body?.settings;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return res.status(400).json({ success: false, message: "settings object is required." });
  }

  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = String(rawKey);
    if (!ALLOWED.has(key)) {
      return res.status(400).json({ success: false, message: `Unknown or protected setting: ${key}` });
    }
    const value = String(rawValue).trim();
    if (!value) return res.status(400).json({ success: false, message: `${key} cannot be empty.` });

    if (["daily_reward_coins","daily_reward_bux","minimum_withdraw_bux","withdrawal_fee_bux","daily_ads_limit"].includes(key) && !validWhole(value)) {
      return res.status(400).json({ success: false, message: `${key} must be a non-negative whole number.` });
    }
    if (key === "minimum_withdraw_bux" && !validWhole(value, 1)) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal must be a positive whole number of BUX." });
    }
    if (key === "referral_percentage") {
      const n = Number(value);
      if (!validDecimal(value) || n > 100) return res.status(400).json({ success: false, message: "Referral percentage must be between 0 and 100." });
    }
    if (["dzp_default_activity","dzp_ad_reward","dzp_referral_reward"].includes(key) && !validDecimal(value)) {
      return res.status(400).json({ success: false, message: `${key} must be a positive number.` });
    }
    if (["dzx_per_ton","coins_per_dzx","coins_per_ton"].includes(key) && !validDecimal(value)) {
      return res.status(400).json({ success: false, message: `${key} must be a positive number.` });
    }
    if (["daily_reward_ad_separate","system_enabled"].includes(key) && !["true","false"].includes(value.toLowerCase())) {
      return res.status(400).json({ success: false, message: `${key} must be true or false.` });
    }
    normalized[key] = value;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();

    // Economy rates are authoritative in economy_settings. coins_per_ton is
    // derived from the two primary rates so the relationship can never drift.
    if (normalized.dzx_per_ton || normalized.coins_per_dzx || normalized.coins_per_ton) {
      const current = await client.query(
        `SELECT key,value FROM economy_settings
         WHERE key IN ('dzx_per_ton','coins_per_dzx','coins_per_ton')`
      );
      const existing = Object.fromEntries(current.rows.map(r => [r.key, r.value]));
      const dzxPerTon = normalized.dzx_per_ton || existing.dzx_per_ton || "10000";
      const coinsPerDZX = normalized.coins_per_dzx || existing.coins_per_dzx || "100";
      const derived = Number(dzxPerTon) * Number(coinsPerDZX);
      if (!Number.isFinite(derived) || derived <= 0) throw new Error("Invalid economy rate combination.");

      normalized.dzx_per_ton = dzxPerTon;
      normalized.coins_per_dzx = coinsPerDZX;
      normalized.coins_per_ton = String(derived);
    }

    for (const [key, value] of Object.entries(normalized)) {
      await client.query(
        `INSERT INTO settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [key, value, now]
      );

      if (DZP_MAP[key]) {
        await client.query(
          `INSERT INTO dzp_settings(key,value,updated_at)
           VALUES($1,$2,NOW())
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
          [DZP_MAP[key], value]
        );
      }

      if (["dzx_per_ton","coins_per_dzx","coins_per_ton"].includes(key)) {
        await client.query(
          `INSERT INTO economy_settings(key,value,updated_at)
           VALUES($1,$2,$3)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
          [key, value, now]
        );
      }
    }

    await client.query("COMMIT");
    await audit(admin.admin_id, Object.entries(normalized).map(([k,v]) => `${k}=${v}`).join(";"));

    const result = await pool.query("SELECT key,value FROM settings ORDER BY key");
    return res.json({ success: true, settings: Object.fromEntries(result.rows.map(r => [r.key, r.value])) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Final admin settings error:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to save settings." });
  } finally {
    client.release();
  }
}

let useCount = 0;
express.application.use = function(...args) {
  useCount += 1;
  // server.js order: express.json(), express.urlencoded(), security middleware,
  // static middleware. Insert after the two body parsers and before routes/static.
  if (useCount === 3) {
    currentUse.call(this, async (req, res, next) => {
      if (req.method === "PUT" && String(req.path || "") === "/api/admin/settings") {
        try { return await handleSettings(req, res); }
        catch (error) {
          console.error("Final admin settings middleware error:", error);
          return res.status(500).json({ success: false, message: "Unable to save settings." });
        }
      }
      return next();
    });
  }
  return currentUse.call(this, ...args);
};

process.on("exit", () => { if (pool) pool.end().catch(() => {}); });
