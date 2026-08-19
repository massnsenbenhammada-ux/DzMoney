"use strict";

const crypto = require("crypto");

function verifyTelegramWebAppInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new Error("Telegram authentication is not configured.");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!receivedHash || !Number.isFinite(authDate)) throw new Error("Invalid Telegram initData.");

  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age < -60 || age > maxAgeSeconds) throw new Error("Telegram initData expired.");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(calculatedHash, "hex");
  const b = Buffer.from(receivedHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid Telegram initData signature.");

  let user = null;
  const rawUser = params.get("user");
  if (rawUser) {
    try { user = JSON.parse(rawUser); } catch (_) { throw new Error("Invalid Telegram user payload."); }
  }
  if (!user || user.id == null) throw new Error("Telegram user is missing.");
  return { user, authDate };
}

function telegramTaskAuth(options = {}) {
  const botToken = options.botToken || process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const maxAgeSeconds = options.maxAgeSeconds || 86400;
  return (req, res, next) => {
    try {
      const initData = req.get("x-telegram-init-data") || req.body?.initData || req.query?.initData;
      const result = verifyTelegramWebAppInitData(initData, botToken, maxAgeSeconds);
      req.telegramUser = result.user;
      req.telegramAuthDate = result.authDate;
      next();
    } catch (error) {
      return res.status(401).json({ ok: false, error: "TELEGRAM_AUTH_FAILED", message: error.message });
    }
  };
}

module.exports = { verifyTelegramWebAppInitData, telegramTaskAuth };
