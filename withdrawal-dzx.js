"use strict";

// Non-destructive DZX withdrawal foundation. This module is preloaded before
// server.js and adds only /api/economy/withdrawals routes. Legacy BUX routes
// remain untouched.

const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");

const OriginalListen = express.application.listen;
let installed = false;

function parseTelegramInitData(initData, botToken) {
  const value = String(initData || "");
  if (!value || !botToken) return null;
  try {
    const params = new URLSearchParams(value);
    const receivedHash = params.get("hash");
    if (!/^[0-9a-fA-F]{64}$/.test(String(receivedHash || ""))) return null;
    const pairs = [];
    for (const [key, val] of params.entries()) {
      if (key !== "hash") pairs.push(`${key}=${val}`);
    }
    pairs.sort();
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(pairs.join("\n")).digest("hex");
    const a = Buffer.from(receivedHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const authDate = Number(params.get("auth_date") || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(authDate) || authDate <= 0 || now - authDate > 3600 || authDate - now > 300) return null;
    const user = JSON.parse(params.get("user") || "null");
    return user?.id ? { id: String(user.id) } : null;
  } catch {
    return null;
  }
}

function decimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function install(app) {
  if (installed) return;
  installed = true;
  if (!process.env.DATABASE_URL) return;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  const auth = (req, res, next) => {
    const initData = req.body?.telegramInitData
      ?? req.headers["x-telegram-init-data"]
      ?? req.headers["x-telegram-webapp-init-data"]
      ?? "";
    const user = parseTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!user) return res.status(401).json({ success: false, code: "TELEGRAM_INIT_DATA_INVALID" });
    req.economyUserId = user.id;
    next();
  };

  app.post("/api/economy/withdrawals", auth, async (req, res) => {
    const client = await pool.connect();
    try {
      const destination = String(req.body?.destination || "").trim();
      const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
      const grossDZX = decimal(req.body?.grossDZX);

      if (!destination || destination.length > 128) {
        return res.status(400).json({ success: false, code: "INVALID_DESTINATION" });
      }
      if (!idempotencyKey || idempotencyKey.length > 128) {
        return res.status(400).json({ success: false, code: "INVALID_IDEMPOTENCY_KEY" });
      }
      if (!Number.isFinite(grossDZX) || grossDZX <= 0) {
        return res.status(400).json({ success: false, code: "INVALID_AMOUNT" });
      }

      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT id,status,gross_dzx,fee_dzx,net_dzx FROM economy_withdrawals WHERE idempotency_key=$1 LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.rowCount) {
        await client.query("COMMIT");
        return res.json({ success: true, replay: true, withdrawal: existing.rows[0] });
      }

      const userResult = await client.query(
        `SELECT id,coins,withdrawable_dzx,locked_dzx FROM users WHERE id=$1 FOR UPDATE`,
        [req.economyUserId]
      );
      if (!userResult.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, code: "USER_NOT_FOUND" });
      }

      const user = userResult.rows[0];
      const settingsResult = await client.query(
        `SELECT key,value FROM economy_settings WHERE key IN ('minimum_withdrawal_ton','dzx_per_ton','minimum_withdrawal_coins','withdrawal_fee_dzx')`
      );
      const settings = Object.fromEntries(settingsResult.rows.map(r => [r.key, r.value]));
      const dzxPerTon = decimal(settings.dzx_per_ton || "10000");
      const minTon = decimal(settings.minimum_withdrawal_ton || "0.2");
      const minDZX = minTon * dzxPerTon;
      const minCoins = decimal(settings.minimum_withdrawal_coins || "2000000");
      const fee = decimal(settings.withdrawal_fee_dzx || "0");

      if (Number(user.coins) < minCoins) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, code: "MINIMUM_COINS_REQUIRED", minimumCoins: minCoins });
      }
      if (grossDZX < minDZX) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, code: "MINIMUM_DZX_REQUIRED", minimumDZX: minDZX });
      }
      if (fee < 0 || fee >= grossDZX) {
        await client.query("ROLLBACK");
        return res.status(500).json({ success: false, code: "INVALID_WITHDRAWAL_FEE" });
      }
      if (Number(user.withdrawable_dzx) < grossDZX) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, code: "INSUFFICIENT_WITHDRAWABLE_DZX" });
      }

      const netDZX = grossDZX - fee;
      const now = Date.now();
      const insert = await client.query(
        `INSERT INTO economy_withdrawals
          (user_id,idempotency_key,destination,network,gross_dzx,fee_dzx,net_dzx,status,created_at,updated_at)
         VALUES($1,$2,$3,'testnet',$4,$5,$6,'PENDING',$7,$7)
         RETURNING id,user_id,destination,network,gross_dzx,fee_dzx,net_dzx,status,created_at`,
        [req.economyUserId, idempotencyKey, destination, grossDZX, fee, netDZX, now]
      );

      await client.query(
        `UPDATE users
         SET withdrawable_dzx = withdrawable_dzx - $1,
             locked_dzx = locked_dzx + $1
         WHERE id=$2`,
        [grossDZX, req.economyUserId]
      );

      await client.query(
        `INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at)
         VALUES($1,'DZX','DEBIT',$2,'withdrawable','WITHDRAWAL_LOCK',$3,$4,$5)`,
        [req.economyUserId, grossDZX, String(insert.rows[0].id), JSON.stringify({ feeDZX: fee, netDZX, destination, network: "testnet" }), now]
      );
      await client.query(
        `INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at)
         VALUES($1,'DZX','CREDIT',$2,'locked','WITHDRAWAL_LOCK',$3,$4,$5)`,
        [req.economyUserId, grossDZX, String(insert.rows[0].id), JSON.stringify({ feeDZX: fee, netDZX }), now]
      );

      await client.query("COMMIT");
      return res.status(201).json({ success: true, withdrawal: insert.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505") {
        const replay = await pool.query(`SELECT id,status,gross_dzx,fee_dzx,net_dzx FROM economy_withdrawals WHERE idempotency_key=$1 LIMIT 1`, [String(req.body?.idempotencyKey || "")]);
        if (replay.rowCount) return res.json({ success: true, replay: true, withdrawal: replay.rows[0] });
      }
      console.error("DZX withdrawal create error:", error);
      return res.status(500).json({ success: false, code: "WITHDRAWAL_CREATE_FAILED" });
    } finally {
      client.release();
    }
  });

  app.get("/api/economy/withdrawals", auth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id,destination,network,gross_dzx,fee_dzx,net_dzx,status,failure_reason,external_tx_id,created_at,updated_at
         FROM economy_withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [req.economyUserId]
      );
      res.json({ success: true, withdrawals: result.rows });
    } catch (error) {
      console.error("DZX withdrawal list error:", error);
      res.status(500).json({ success: false, code: "WITHDRAWAL_LIST_FAILED" });
    }
  });
}

express.application.listen = function (...args) {
  install(this);
  return OriginalListen.apply(this, args);
};
