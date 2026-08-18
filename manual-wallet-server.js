const crypto = require("crypto");
const { Pool } = require("pg");
const { Address } = require("@ton/ton");
const express = require("express");

// Manual wallet mode is an additional withdrawal-address method.
// It does not replace TON Connect; it is especially useful for Testnet
// because a user can paste a known Testnet address without opening a wallet
// inside Telegram.
const DATABASE_URL = String(process.env.DATABASE_URL || "");
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/^['"]|['"]$/g, "");
const PAYOUT_NETWORK = String(process.env.TON_PAYOUT_NETWORK || "testnet").toLowerCase();
const NETWORK_CHAIN = PAYOUT_NETWORK === "mainnet" ? "-239" : "-3";

if (DATABASE_URL) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  function parseTelegramInitData(initData) {
    if (!initData || !BOT_TOKEN) return null;
    try {
      const params = new URLSearchParams(String(initData));
      const receivedHash = params.get("hash");
      if (!/^[0-9a-fA-F]{64}$/.test(String(receivedHash || ""))) return null;

      const pairs = [];
      for (const [key, value] of params.entries()) {
        if (key !== "hash") pairs.push(`${key}=${value}`);
      }
      pairs.sort();
      const dataCheckString = pairs.join("\n");
      const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
      const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
      const a = Buffer.from(receivedHash, "hex");
      const b = Buffer.from(expectedHash, "hex");
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

      const authDate = Number(params.get("auth_date") || 0);
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isSafeInteger(authDate) || authDate <= 0 || now - authDate > 3600 || authDate - now > 300) return null;

      const user = JSON.parse(params.get("user") || "null");
      return user?.id ? { id: user.id } : null;
    } catch {
      return null;
    }
  }

  function authUser(req) {
    const initData = req.headers["x-telegram-init-data"] || req.headers["x-telegram-webapp-init-data"] || "";
    return parseTelegramInitData(initData);
  }

  function isAddressForNetwork(value) {
    const address = String(value || "").trim();
    if (!address || address.length > 256) return false;
    try {
      Address.parse(address);
    } catch {
      return false;
    }

    // User-friendly TON addresses carry a Testnet-only flag. Raw addresses
    // do not, so raw addresses are deliberately rejected for manual entry.
    if (NETWORK_CHAIN === "-3") return /^(?:kQ|0Q)[A-Za-z0-9_-]{46}$/.test(address);
    return /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address);
  }

  function getAmount(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : NaN;
  }

  async function manualWalletHandler(req, res) {
    const telegramUser = authUser(req);
    if (!telegramUser) {
      return res.status(401).json({ success: false, message: "Telegram authorization data is missing or invalid." });
    }

    const userId = String(telegramUser.id);
    const address = String(req.body?.manualAddress || "").trim();

    try {
      if (!address) {
        await pool.query(
          `UPDATE users SET wallet_address='',wallet_chain='',wallet_connected_at=0,wallet_public_key='',wallet_verified_at=0 WHERE id=$1`,
          [userId]
        );
        return res.json({ success: true, disconnected: true });
      }

      if (!isAddressForNetwork(address)) {
        return res.status(400).json({
          success: false,
          message: NETWORK_CHAIN === "-3"
            ? "Invalid Testnet TON address. Use a user-friendly address beginning with kQ or 0Q."
            : "Invalid Mainnet TON address. Use a user-friendly address beginning with EQ or UQ."
        });
      }

      const conflict = await pool.query(
        `SELECT id FROM users WHERE wallet_address=$1 AND id<>$2 LIMIT 1`,
        [address, userId]
      );
      if (conflict.rowCount) {
        return res.status(409).json({ success: false, message: "This TON wallet is already linked to another account." });
      }

      const now = Date.now();
      const updated = await pool.query(
        `UPDATE users
         SET wallet_address=$1,wallet_chain=$2,wallet_connected_at=$3,
             wallet_public_key='manual',wallet_verified_at=$3
         WHERE id=$4
         RETURNING wallet_address,wallet_chain,wallet_connected_at,wallet_verified_at`,
        [address, NETWORK_CHAIN, now, userId]
      );

      if (!updated.rowCount) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      return res.json({
        success: true,
        wallet: {
          connected: true,
          verified: true,
          manual: true,
          address: updated.rows[0].wallet_address,
          chain: updated.rows[0].wallet_chain,
          connectedAt: Number(updated.rows[0].wallet_connected_at),
          verifiedAt: Number(updated.rows[0].wallet_verified_at)
        }
      });
    } catch (error) {
      console.error("Manual wallet error:", error);
      return res.status(500).json({ success: false, message: "Unable to save the withdrawal address." });
    }
  }

  async function manualWithdrawalHandler(req, res) {
    const telegramUser = authUser(req);
    if (!telegramUser) {
      return res.status(401).json({ success: false, message: "Telegram authorization data is missing or invalid." });
    }

    const userId = String(telegramUser.id);
    const amount = getAmount(req.body?.amountBux);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid withdrawal amount is required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const userResult = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!userResult.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "User not found." });
      }
      const user = userResult.rows[0];
      if (user.is_banned) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "This account is banned." });
      }

      const destination = String(user.wallet_address || "").trim();
      const chain = String(user.wallet_chain || "");
      if (!user.wallet_verified_at || !destination || chain !== NETWORK_CHAIN || !isAddressForNetwork(destination)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: NETWORK_CHAIN === "-3"
            ? "Save a valid Testnet withdrawal address first."
            : "Save a valid Mainnet withdrawal address first."
        });
      }

      const minimumResult = await client.query("SELECT value FROM settings WHERE key='minimum_withdraw_bux' LIMIT 1");
      const feeResult = await client.query("SELECT value FROM settings WHERE key='withdrawal_fee_bux' LIMIT 1");
      const minimum = Math.max(1, Math.floor(Number(minimumResult.rows[0]?.value || 2000)));
      const fee = Math.max(0, Math.floor(Number(feeResult.rows[0]?.value || 0)));
      const buxPerTon = 10000;

      if (amount < minimum) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: `Minimum withdrawal is ${minimum} BUX.` });
      }
      if (!Number.isSafeInteger(fee) || fee < 0 || fee >= amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Withdrawal fee configuration is invalid." });
      }
      if (Number(user.bux) < amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Insufficient BUX." });
      }

      const pending = await client.query(
        `SELECT id FROM withdrawals WHERE user_id=$1 AND status IN ('pending','approved','processing') LIMIT 1`,
        [userId]
      );
      if (pending.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "You already have a withdrawal in progress." });
      }

      const net = amount - fee;
      const amountTon = Number((net / buxPerTon).toFixed(9));
      const now = Date.now();
      await client.query(`UPDATE users SET bux=bux-$1 WHERE id=$2`, [amount, userId]);
      const created = await client.query(
        `INSERT INTO withdrawals
         (user_id,amount_bux,amount_ton,fee_bux,net_bux,destination,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$7) RETURNING *`,
        [userId, amount, amountTon, fee, net, destination, now]
      );

      await client.query("COMMIT");
      return res.json({
        success: true,
        withdrawal: {
          id: Number(created.rows[0].id),
          amountBux: amount,
          amountTon,
          feeBux: fee,
          netBux: net,
          destination,
          status: "pending",
          createdAt: now
        }
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Manual withdrawal error:", error);
      return res.status(500).json({ success: false, message: "Unable to create withdrawal." });
    } finally {
      client.release();
    }
  }

  const originalPost = express.application.post;
  express.application.post = function(path, ...handlers) {
    if (path === "/api/wallet/disconnect") {
      return originalPost.call(this, path, manualWalletHandler);
    }
    if (path === "/api/withdrawals") {
      return originalPost.call(this, path, manualWithdrawalHandler);
    }
    return originalPost.call(this, path, ...handlers);
  };

  console.log(`Manual wallet mode: ENABLED for ${NETWORK_CHAIN === "-3" ? "TESTNET" : "MAINNET"}`);
} else {
  console.warn("Manual wallet mode: DATABASE_URL is missing; patch disabled.");
}

module.exports = {};
