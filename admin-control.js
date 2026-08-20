"use strict";

const express = require("express");
const pg = require("pg");
const fs = require("fs");
const path = require("path");

const pool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const SETTINGS = new Set([
  "daily_reward_coins", "daily_reward_bux", "minimum_withdraw_bux",
  "withdrawal_fee_bux", "daily_ads_limit", "daily_reward_ad_separate",
  "referral_percentage", "system_enabled", "dzp_default_activity",
  "dzp_ad_reward", "dzp_referral_reward", "dzx_per_ton", "coins_per_dzx",
  "coins_per_ton"
]);
const WHOLE = new Set(["daily_reward_coins", "daily_reward_bux", "minimum_withdraw_bux", "withdrawal_fee_bux", "daily_ads_limit"]);
const RATE_KEYS = new Set(["dzx_per_ton", "coins_per_dzx", "coins_per_ton"]);
const DZP_MAP = { dzp_default_activity: "default_activity_dzp", dzp_ad_reward: "ad_dzp_reward", dzp_referral_reward: "referral_dzp_reward" };
const originalPoolQuery = pg.Pool.prototype.query;

function whole(value, min = 0) {
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) >= min;
}
function decimal(value, min = 0) {
  const text = String(value).trim();
  const n = Number(text);
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n) && n >= min;
}
function adminToken(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const value = part.trim();
    if (value.startsWith("dz_admin=")) return value.slice("dz_admin=".length);
  }
  return "";
}
async function authenticate(req, res) {
  if (!pool || !process.env.ADMIN_PASSWORD) {
    res.status(503).json({ success: false, message: "Admin panel is disabled." });
    return null;
  }
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-dzmoney-admin-request"] !== "1") {
    res.status(403).json({ success: false, message: "Invalid admin request." });
    return null;
  }
  const token = adminToken(req);
  if (!token) { res.status(401).json({ success: false, message: "Admin authentication required." }); return null; }
  const result = await pool.query("SELECT token,admin_id,created_at,expires_at FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1", [token, Date.now()]);
  if (!result.rowCount) { res.status(401).json({ success: false, message: "Admin authentication required." }); return null; }
  return result.rows[0];
}
async function audit(adminId, action, targetId, details) {
  try {
    await pool.query("INSERT INTO admin_audit(admin_id,action,target_id,details,created_at) VALUES($1,$2,$3,$4,$5)", [String(adminId || "owner"), action, String(targetId || ""), String(details || ""), Date.now()]);
  } catch (error) { console.error("Admin control audit error:", error.message); }
}

async function saveSettings(req, res) {
  const values = req.body?.settings;
  if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ success: false, message: "settings object is required." });
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = String(rawKey), value = String(rawValue).trim();
    if (!SETTINGS.has(key)) return res.status(400).json({ success: false, message: `Unknown or protected setting: ${key}` });
    if (!value) return res.status(400).json({ success: false, message: `${key} cannot be empty.` });
    if (WHOLE.has(key) && !whole(value)) return res.status(400).json({ success: false, message: `${key} must be a non-negative whole number.` });
    if (key === "minimum_withdraw_bux" && !whole(value, 1)) return res.status(400).json({ success: false, message: "Minimum withdrawal must be a positive whole number." });
    if (key === "referral_percentage" && (!decimal(value) || Number(value) > 100)) return res.status(400).json({ success: false, message: "Referral percentage must be between 0 and 100." });
    if (["dzp_default_activity", "dzp_ad_reward", "dzp_referral_reward"].includes(key) && !decimal(value)) return res.status(400).json({ success: false, message: `${key} must be a non-negative number.` });
    if (RATE_KEYS.has(key) && !decimal(value, 0.000000001)) return res.status(400).json({ success: false, message: `${key} must be a positive number.` });
    if (["daily_reward_ad_separate", "system_enabled"].includes(key) && !["true", "false"].includes(value.toLowerCase())) return res.status(400).json({ success: false, message: `${key} must be true or false.` });
    normalized[key] = value;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();
    if (Object.keys(normalized).some(key => RATE_KEYS.has(key))) {
      const current = await client.query("SELECT key,value FROM economy_settings WHERE key IN ('dzx_per_ton','coins_per_dzx','coins_per_ton')");
      const existing = Object.fromEntries(current.rows.map(row => [row.key, row.value]));
      const dzxPerTon = normalized.dzx_per_ton ?? existing.dzx_per_ton ?? "10000";
      const coinsPerDZX = normalized.coins_per_dzx ?? existing.coins_per_dzx ?? "100";
      const derived = Number(dzxPerTon) * Number(coinsPerDZX);
      if (!Number.isFinite(derived) || derived <= 0) throw new Error("Invalid TON/DZX/COIN rate combination.");
      normalized.dzx_per_ton = dzxPerTon;
      normalized.coins_per_dzx = coinsPerDZX;
      normalized.coins_per_ton = String(derived);
    }
    for (const [key, value] of Object.entries(normalized)) {
      await client.query(`INSERT INTO settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`, [key, value, now]);
      if (DZP_MAP[key]) await client.query(`INSERT INTO dzp_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, [DZP_MAP[key], value]);
      if (RATE_KEYS.has(key)) await client.query(`INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`, [key, value, now]);
    }
    await client.query("COMMIT");
    await audit(req.admin.admin_id, "update_settings", "", Object.entries(normalized).map(([k,v]) => `${k}=${v}`).join(";"));
    const result = await pool.query("SELECT key,value FROM settings ORDER BY key");
    return res.json({ success: true, settings: Object.fromEntries(result.rows.map(row => [row.key, row.value])) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin settings save error:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to save settings." });
  } finally { client.release(); }
}

async function economyGet(req, res) {
  try {
    const result = await pool.query(`SELECT id,dzp,dzx,coins,deposited_dzx,withdrawable_dzx,locked_dzx FROM users WHERE id=$1 LIMIT 1`, [String(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) { console.error("Admin economy read error:", error); return res.status(500).json({ success: false, message: "Unable to load user economy." }); }
}

async function economySet(req, res) {
  const userId = String(req.params.id);
  const hasDZP = Object.prototype.hasOwnProperty.call(req.body || {}, "dzp");
  const hasDZX = Object.prototype.hasOwnProperty.call(req.body || {}, "dzx");
  if (!hasDZP && !hasDZX) return null;
  const dzp = hasDZP ? Number(req.body.dzp) : null;
  const dzxText = hasDZX ? String(req.body.dzx).trim() : "";
  const dzx = hasDZX ? Number(dzxText) : null;
  if (hasDZP && (!Number.isSafeInteger(dzp) || dzp < 0)) return res.status(400).json({ success: false, message: "DZP must be a non-negative whole number." });
  if (hasDZX && (!Number.isFinite(dzx) || dzx < 0 || !/^\d+(\.\d{1,9})?$/.test(dzxText))) return res.status(400).json({ success: false, message: "DZX must be a non-negative number with up to 9 decimal places." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id,dzp,dzx FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "User not found." }); }
    const beforeDZP = Number(current.rows[0].dzp || 0), beforeDZX = Number(current.rows[0].dzx || 0);
    const afterDZP = hasDZP ? dzp : beforeDZP, afterDZX = hasDZX ? dzx : beforeDZX;
    const updated = await client.query("UPDATE users SET dzp=$1,dzx=$2 WHERE id=$3 RETURNING *", [afterDZP, afterDZX, userId]);
    if (afterDZP !== beforeDZP) await client.query(`INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,'DZP',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`, [userId, afterDZP > beforeDZP ? "CREDIT" : "DEBIT", Math.abs(afterDZP - beforeDZP), `ADMIN:${req.admin.admin_id}:${Date.now()}`, JSON.stringify({ before: beforeDZP, after: afterDZP }), Date.now()]);
    if (afterDZX !== beforeDZX) await client.query(`INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,'DZX',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`, [userId, afterDZX > beforeDZX ? "CREDIT" : "DEBIT", Math.abs(afterDZX - beforeDZX), `ADMIN:${req.admin.admin_id}:${Date.now()}`, JSON.stringify({ before: beforeDZX, after: afterDZX }), Date.now()]);
    await client.query("COMMIT");
    await audit(req.admin.admin_id, "set_economy_balance", userId, `dzp=${afterDZP};dzx=${afterDZX}`);
    return res.json({ success: true, user: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("Admin economy set error:", error); return res.status(500).json({ success: false, message: "Unable to set DZX/DZP balance." }); }
  finally { client.release(); }
}

async function economyDelta(req, res) {
  const userId = String(req.params.id);
  const hasDZP = Object.prototype.hasOwnProperty.call(req.body || {}, "dzpDelta");
  const hasDZX = Object.prototype.hasOwnProperty.call(req.body || {}, "dzxDelta");
  if (!hasDZP && !hasDZX) return null;
  const dzpDelta = hasDZP ? Number(req.body.dzpDelta) : 0;
  const dzxText = hasDZX ? String(req.body.dzxDelta).trim() : "0";
  const dzxDelta = hasDZX ? Number(dzxText) : 0;
  if (hasDZP && !Number.isSafeInteger(dzpDelta)) return res.status(400).json({ success: false, message: "DZP delta must be a whole number." });
  if (hasDZX && (!Number.isFinite(dzxDelta) || !/^[-+]?\d+(\.\d{1,9})?$/.test(dzxText))) return res.status(400).json({ success: false, message: "DZX delta must be a valid number with up to 9 decimal places." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id,dzp,dzx FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "User not found." }); }
    const beforeDZP = Number(current.rows[0].dzp || 0), beforeDZX = Number(current.rows[0].dzx || 0);
    const afterDZP = beforeDZP + dzpDelta, afterDZX = beforeDZX + dzxDelta;
    if (!Number.isSafeInteger(afterDZP) || afterDZP < 0) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: "DZP balance cannot become negative or exceed the safe integer range." }); }
    if (!Number.isFinite(afterDZX) || afterDZX < 0) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: "DZX balance cannot become negative." }); }
    const updated = await client.query("UPDATE users SET dzp=$1,dzx=$2 WHERE id=$3 RETURNING *", [afterDZP, afterDZX, userId]);
    if (dzpDelta !== 0) await client.query(`INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,'DZP',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`, [userId, dzpDelta > 0 ? "CREDIT" : "DEBIT", Math.abs(dzpDelta), `ADMIN:${req.admin.admin_id}:${Date.now()}`, JSON.stringify({ before: beforeDZP, after: afterDZP, delta: dzpDelta }), Date.now()]);
    if (dzxDelta !== 0) await client.query(`INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,'DZX',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`, [userId, dzxDelta > 0 ? "CREDIT" : "DEBIT", Math.abs(dzxDelta), `ADMIN:${req.admin.admin_id}:${Date.now()}`, JSON.stringify({ before: beforeDZX, after: afterDZX, delta: dzxDelta }), Date.now()]);
    await client.query("COMMIT");
    await audit(req.admin.admin_id, "adjust_economy_balance", userId, `dzpDelta=${dzpDelta};dzxDelta=${dzxDelta}`);
    return res.json({ success: true, user: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("Admin economy delta error:", error); return res.status(500).json({ success: false, message: "Unable to adjust DZX/DZP balance." }); }
  finally { client.release(); }
}

function patchApplicationMethods() {
  const oldPut = express.application.put, oldPost = express.application.post, oldGet = express.application.get, oldUse = express.application.use;
  express.application.put = function(pathname, ...handlers) {
    if (pathname === "/api/admin/settings" && handlers.length >= 1) return oldPut.call(this, pathname, handlers[0], async (req, res) => { const admin = await authenticate(req, res); if (!admin) return; req.admin = { adminId: admin.admin_id, token: admin.token }; return saveSettings(req, res); });
    if (pathname === "/api/admin/users/:id/balance" && handlers.length >= 1) return oldPut.call(this, pathname, handlers[0], async (req, res, next) => { if (Object.prototype.hasOwnProperty.call(req.body || {}, "dzp") || Object.prototype.hasOwnProperty.call(req.body || {}, "dzx")) { const admin = await authenticate(req, res); if (!admin) return; req.admin = { adminId: admin.admin_id, token: admin.token }; return economySet(req, res); } return next(); });
    return oldPut.call(this, pathname, ...handlers);
  };
  express.application.post = function(pathname, ...handlers) {
    if (pathname === "/api/admin/users/:id/balance" && handlers.length >= 1) return oldPost.call(this, pathname, handlers[0], async (req, res, next) => { if (Object.prototype.hasOwnProperty.call(req.body || {}, "dzpDelta") || Object.prototype.hasOwnProperty.call(req.body || {}, "dzxDelta")) { const admin = await authenticate(req, res); if (!admin) return; req.admin = { adminId: admin.admin_id, token: admin.token }; return economyDelta(req, res); } return next(); });
    if (pathname === "/api/admin/users/:id/economy" && handlers.length >= 1) return oldPost.call(this, pathname, handlers[0], async (req, res) => { const admin = await authenticate(req, res); if (!admin) return; req.admin = { adminId: admin.admin_id, token: admin.token }; return economyDelta(req, res); });
    return oldPost.call(this, pathname, ...handlers);
  };
  express.application.get = function(pathname, ...handlers) {
    if (pathname === "/api/admin/users/:id/economy" && handlers.length >= 1) return oldGet.call(this, pathname, handlers[0], async (req, res) => { const admin = await authenticate(req, res); if (!admin) return; req.admin = { adminId: admin.admin_id, token: admin.token }; return economyGet(req, res); });
    return oldGet.call(this, pathname, ...handlers);
  };
  let injected = false;
  express.application.use = function(...args) {
    if (!injected) { injected = true; oldUse.call(this, (req, res, next) => { if (String(req.path || "") === "/admin.html" && typeof res.sendFile === "function") { const originalSendFile = res.sendFile.bind(res); res.sendFile = function(filePath, ...sendArgs) { if (path.basename(String(filePath)) !== "admin.html") return originalSendFile(filePath, ...sendArgs); fs.readFile(filePath, "utf8", (error, html) => { if (error) return originalSendFile(filePath, ...sendArgs); const script = '<script src="/admin-economy-ui.js?v=3"></script>'; const output = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`; res.type("html").send(output); }); }; } next(); }); }
    return oldUse.call(this, ...args);
  };
}

function installRuntimeSettings() {
  const cache = Object.create(null); let lastRefresh = 0; let pending = null;
  async function refresh(poolInstance) {
    const now = Date.now(); if (now - lastRefresh < 1000) return; if (pending) return pending;
    pending = originalPoolQuery.call(poolInstance, "SELECT key,value FROM settings WHERE key = ANY($1)", [["daily_reward_coins", "daily_reward_bux", "coins_per_bux"]]).then(result => { for (const row of result.rows || []) cache[row.key] = row.value; lastRefresh = Date.now(); }).catch(() => {}).finally(() => { pending = null; });
    return pending;
  }
  pg.Pool.prototype.query = function dzmoneyAdminRuntimeQuery(config, values, callback) {
    const sql = typeof config === "string" ? config : (config && config.text) || "";
    const upper = String(sql).replace(/\s+/g, " ").trim().toUpperCase();
    const relevant = upper.includes("DAILY_CLAIM_AT=$3") || upper.includes("UPDATE USERS SET COINS=COINS+$1, BUX=BUX+$2");
    if (!relevant) return originalPoolQuery.apply(this, arguments);
    return refresh(this).then(() => {
      const source = typeof config === "string" ? values : config.values;
      const nextValues = Array.isArray(source) ? source.slice() : source;
      if (Array.isArray(nextValues)) {
        if (upper.includes("DAILY_CLAIM_AT=$3") && nextValues.length >= 4) { nextValues[0] = Math.trunc(Number(cache.daily_reward_coins) || Number(nextValues[0]) || 1000); nextValues[1] = Math.trunc(Number(cache.daily_reward_bux) || Number(nextValues[1]) || 1); }
        if (upper.includes("UPDATE USERS SET COINS=COINS+$1, BUX=BUX+$2") && nextValues.length >= 3) { const rewardBux = Number(nextValues[1]), rate = Number(cache.coins_per_bux) || 100; if (Number.isFinite(rewardBux) && rewardBux >= 0) nextValues[0] = Math.trunc(rewardBux * rate); }
      }
      if (typeof config === "string") return originalPoolQuery.call(this, config, nextValues, callback);
      return originalPoolQuery.call(this, Object.assign({}, config, { values: nextValues }), callback);
    });
  };
}

patchApplicationMethods();
installRuntimeSettings();
console.log("DzMoney Admin control: canonical runtime enabled");
process.on("exit", () => { if (pool) pool.end().catch(() => {}); });
