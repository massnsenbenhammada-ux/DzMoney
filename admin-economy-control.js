"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// This module is loaded after admin-settings-compat.js and before server.js.
// It adds authoritative DZP balance controls and dynamic TON/DZX/COIN rates
// without replacing the existing authentication middleware.
const currentPut = express.application.put;
const currentPost = express.application.post;
const currentGet = express.application.get;
const currentUse = express.application.use;

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const ECONOMY_RATE_KEYS = new Set(["dzx_per_ton", "coins_per_dzx", "coins_per_ton"]);

function nonNegativeSafeInteger(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0;
}

function nonNegativeDecimal(value) {
  const text = String(value).trim();
  const n = Number(text);
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n) && n > 0;
}

async function audit(adminId, action, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO admin_audit(admin_id,action,target_id,details,created_at)
       VALUES($1,$2,$3,$4,$5)`,
      [String(adminId || "admin"), action, String(targetId || ""), String(details || ""), Date.now()]
    );
  } catch (error) {
    console.error("Admin economy audit error:", error.message);
  }
}

async function saveEconomySettings(req, res) {
  const values = req.body?.settings;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return res.status(400).json({ success: false, message: "settings object is required." });
  }

  const updates = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = String(rawKey);
    if (!ECONOMY_RATE_KEYS.has(key)) continue;
    const value = String(rawValue).trim();
    if (!nonNegativeDecimal(value)) {
      return res.status(400).json({ success: false, message: `${key} must be a positive number.` });
    }
    updates[key] = value;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: "No economy rate was supplied." });
  }

  const current = await pool.query(
    `SELECT key,value FROM economy_settings
     WHERE key IN ('dzx_per_ton','coins_per_dzx','coins_per_ton')`
  );
  const existing = Object.fromEntries(current.rows.map(row => [row.key, row.value]));

  const dzxPerTon = updates.dzx_per_ton ?? existing.dzx_per_ton ?? "10000";
  const coinsPerDZX = updates.coins_per_dzx ?? existing.coins_per_dzx ?? "100";
  const derivedCoinsPerTon = Number(dzxPerTon) * Number(coinsPerDZX);

  if (!Number.isFinite(derivedCoinsPerTon) || derivedCoinsPerTon <= 0) {
    return res.status(400).json({ success: false, message: "Invalid TON/DZX/COIN rate combination." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();

    const finalRates = {
      dzx_per_ton: dzxPerTon,
      coins_per_dzx: coinsPerDZX,
      coins_per_ton: String(derivedCoinsPerTon)
    };

    for (const [key, value] of Object.entries(finalRates)) {
      await client.query(
        `INSERT INTO economy_settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [key, value, now]
      );
      await client.query(
        `INSERT INTO settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [key, value, now]
      );
    }

    await client.query("COMMIT");
    await audit(
      req.admin?.adminId,
      "update_economy_rates",
      "",
      `dzx_per_ton=${finalRates.dzx_per_ton};coins_per_dzx=${finalRates.coins_per_dzx};coins_per_ton=${finalRates.coins_per_ton}`
    );

    const settings = await pool.query("SELECT key,value FROM settings ORDER BY key");
    return res.json({
      success: true,
      settings: Object.fromEntries(settings.rows.map(row => [row.key, row.value]))
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin economy rates error:", error);
    return res.status(500).json({ success: false, message: "Unable to save economy rates." });
  } finally {
    client.release();
  }
}

async function adminBalanceDelta(req, res) {
  const userId = String(req.params.id);
  const dzpDelta = Number(req.body?.dzpDelta ?? 0);
  if (!Number.isSafeInteger(dzpDelta)) {
    return res.status(400).json({ success: false, message: "DZP delta must be a whole number." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id,dzp FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const before = Number(current.rows[0].dzp || 0);
    const after = before + dzpDelta;
    if (!nonNegativeSafeInteger(after)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "DZP balance cannot become negative or exceed the safe integer range." });
    }

    const updated = await client.query(
      `UPDATE users SET dzp=$1 WHERE id=$2 RETURNING *`,
      [after, userId]
    );

    if (dzpDelta !== 0) {
      const amount = Math.abs(dzpDelta);
      const direction = dzpDelta > 0 ? "CREDIT" : "DEBIT";
      const sourceId = `ADMIN:${req.admin?.adminId || "admin"}:${Date.now()}:${cryptoRandom()}`;
      await client.query(
        `INSERT INTO economy_ledger
          (user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at)
         VALUES($1,'DZP',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`,
        [userId, direction, amount, sourceId, JSON.stringify({ before, after, adminId: req.admin?.adminId || "" }), Date.now()]
      );
    }

    await client.query("COMMIT");
    await audit(req.admin?.adminId, "dzp_balance_delta", userId, `before=${before};delta=${dzpDelta};after=${after}`);
    return res.json({ success: true, user: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin DZP delta error:", error);
    return res.status(500).json({ success: false, message: "Unable to change DZP balance." });
  } finally {
    client.release();
  }
}

async function adminBalanceExact(req, res) {
  const raw = req.body?.dzp;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return res.status(400).json({ success: false, message: "DZP value is required." });
  }
  const dzp = Number(raw);
  if (!nonNegativeSafeInteger(dzp)) {
    return res.status(400).json({ success: false, message: "DZP must be a non-negative whole number." });
  }

  const userId = String(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id,dzp FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const before = Number(current.rows[0].dzp || 0);
    const delta = dzp - before;
    const updated = await client.query("UPDATE users SET dzp=$1 WHERE id=$2 RETURNING *", [dzp, userId]);

    if (delta !== 0) {
      const direction = delta > 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(delta);
      const sourceId = `ADMIN:${req.admin?.adminId || "admin"}:${Date.now()}:${cryptoRandom()}`;
      await client.query(
        `INSERT INTO economy_ledger
          (user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at)
         VALUES($1,'DZP',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5,$6)`,
        [userId, direction, amount, sourceId, JSON.stringify({ before, after: dzp, adminId: req.admin?.adminId || "" }), Date.now()]
      );
    }

    await client.query("COMMIT");
    await audit(req.admin?.adminId, "set_dzp_balance", userId, `before=${before};after=${dzp};delta=${delta}`);
    return res.json({ success: true, user: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin exact DZP error:", error);
    return res.status(500).json({ success: false, message: "Unable to set DZP balance." });
  } finally {
    client.release();
  }
}

async function adminEconomyGet(req, res) {
  try {
    const result = await pool.query(
      `SELECT id,dzp,dzx,coins,deposited_dzx,withdrawable_dzx,locked_dzx
       FROM users WHERE id=$1 LIMIT 1`,
      [String(req.params.id)]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Admin economy user error:", error);
    return res.status(500).json({ success: false, message: "Unable to load user economy." });
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

// IMPORTANT: /balance is shared with the legacy BUX/Coins Admin control in
// server.js. Only intercept requests that explicitly contain DZP fields.
// Legacy {bux,coins} and {buxDelta,coinsDelta} requests must continue to the
// original server handler. This prevents a missing DZP field from producing
// the misleading "DZP must be a non-negative whole number" error.
const oldPut = express.application.put;
const oldPost = express.application.post;
const oldGet = express.application.get;

express.application.put = function(pathname, ...handlers) {
  if (pathname === "/api/admin/settings" && handlers.length >= 1) {
    return oldPut.call(this, pathname, handlers[0], saveEconomySettingsOrContinue);
  }
  if (pathname === "/api/admin/users/:id/balance" && handlers.length >= 1) {
    const authHandler = handlers[0];
    const balanceDispatcher = (req, res, next) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "dzp")) {
        return adminBalanceExact(req, res);
      }
      return next();
    };
    return oldPut.call(this, pathname, authHandler, balanceDispatcher);
  }
  return oldPut.call(this, pathname, ...handlers);
};

async function saveEconomySettingsOrContinue(req, res, next) {
  const values = req.body?.settings || {};
  const hasRate = Object.keys(values).some((key) => ECONOMY_RATE_KEYS.has(String(key)));
  if (!hasRate) return next();
  return saveEconomySettings(req, res);
}

express.application.post = function(pathname, ...handlers) {
  if (pathname === "/api/admin/users/:id/balance" && handlers.length >= 1) {
    const authHandler = handlers[0];
    const balanceDispatcher = (req, res, next) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "dzpDelta")) {
        return adminBalanceDelta(req, res);
      }
      return next();
    };
    return oldPost.call(this, pathname, authHandler, balanceDispatcher);
  }
  return oldPost.call(this, pathname, ...handlers);
};

express.application.get = function(pathname, ...handlers) {
  if (pathname === "/api/admin/users/:id/economy" && handlers.length >= 1) {
    return oldGet.call(this, pathname, handlers[0], adminEconomyGet);
  }
  return oldGet.call(this, pathname, ...handlers);
};

// Insert the Admin UI enhancer before the first application middleware so the
// static admin.html response can receive the small DZP/rates control script.
let usePatched = false;
express.application.use = function(...args) {
  if (!usePatched) {
    usePatched = true;
    const enhancer = function(req, res, next) {
      if (String(req.path || "") === "/admin.html" && typeof res.sendFile === "function") {
        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function(filePath, ...sendArgs) {
          if (path.basename(String(filePath)) !== "admin.html") return originalSendFile(filePath, ...sendArgs);
          fs.readFile(filePath, "utf8", (error, html) => {
            if (error) return originalSendFile(filePath, ...sendArgs);
            const script = `<script src="/admin-economy-ui.js?v=1"></script>`;
            const output = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
            res.type("html").send(output);
          });
        };
      }
      next();
    };
    currentUse.call(this, enhancer);
  }
  return currentUse.call(this, ...args);
};

process.on("exit", () => { if (pool) pool.end().catch(() => {}); });
