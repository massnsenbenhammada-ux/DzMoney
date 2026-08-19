"use strict";

// Non-destructive application-layer bridge for the new DZX/DZP economy.
// It is preloaded before server.js and registers only new /api/economy/*
// endpoints when Express starts. Existing routes remain untouched.

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

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(pairs.join("\n"))
      .digest("hex");

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
      ?? req.query?.telegramInitData
      ?? req.headers["x-telegram-init-data"]
      ?? req.headers["x-telegram-webapp-init-data"]
      ?? "";

    const user = parseTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!user) return res.status(401).json({ success: false, code: "TELEGRAM_INIT_DATA_INVALID" });
    req.economyUserId = user.id;
    next();
  };

  app.get("/api/economy/me", auth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, coins, dzx, dzp, deposited_dzx, withdrawable_dzx, locked_dzx
         FROM users WHERE id=$1 LIMIT 1`,
        [req.economyUserId]
      );

      if (!result.rowCount) return res.status(404).json({ success: false, message: "User not found." });
      const user = result.rows[0];

      const settingsResult = await pool.query(
        `SELECT key,value FROM economy_settings
         WHERE key IN ('dzx_per_ton','minimum_deposit_ton','minimum_withdrawal_ton','minimum_withdrawal_coins','withdrawal_fee_dzx','referral_percentage','squad_activity_threshold_percent','squad_max_bonus_percent')`
      );
      const settings = Object.fromEntries(settingsResult.rows.map(row => [row.key, row.value]));

      res.json({
        success: true,
        economy: {
          asset: "DZX",
          pointsAsset: "DZP",
          coins: Number(user.coins) || 0,
          dzx: String(user.dzx ?? "0"),
          dzp: Number(user.dzp) || 0,
          depositedDZX: String(user.deposited_dzx ?? "0"),
          withdrawableDZX: String(user.withdrawable_dzx ?? "0"),
          lockedDZX: String(user.locked_dzx ?? "0"),
          settings
        }
      });
    } catch (error) {
      console.error("Economy API error:", error);
      res.status(500).json({ success: false, message: "Unable to load economy data." });
    }
  });

  app.get("/api/economy/status", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ success: true, status: "online", dzxEnabled: true, dzpEnabled: true });
    } catch {
      res.status(503).json({ success: false, status: "database_error" });
    }
  });
}

express.application.listen = function (...args) {
  install(this);
  return OriginalListen.apply(this, args);
};
