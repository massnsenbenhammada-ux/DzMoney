'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const AUTH_HEADER = 'x-telegram-init-data';

function unauthorized(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function parseInitData(rawInitData) {
  const params = new URLSearchParams(rawInitData);
  const entries = [...params.entries()];
  const seen = new Set();

  for (const [key] of entries) {
    if (seen.has(key)) throw unauthorized('Invalid Telegram authentication data');
    seen.add(key);
  }

  const hash = params.get('hash');
  if (!hash) throw unauthorized('Invalid Telegram authentication data');

  const dataCheckString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return { params, hash, dataCheckString };
}

function getTelegramSecretKey(botToken) {
  return crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
}

function getExpectedHash(botToken, dataCheckString) {
  return crypto
    .createHmac('sha256', getTelegramSecretKey(botToken))
    .update(dataCheckString)
    .digest('hex');
}

function telegramAuth(options = {}) {
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds)
    ? options.maxAgeSeconds
    : DEFAULT_MAX_AGE_SECONDS;

  if (!botToken || typeof botToken !== 'string') {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('Telegram authentication max age must be a positive integer');
  }

  return function telegramAuthMiddleware(req, res, next) {
    try {
      const rawInitData = req.get(AUTH_HEADER);
      if (!rawInitData || rawInitData.length > 16 * 1024) {
        return next(unauthorized('Telegram authentication required'));
      }

      const { params, hash, dataCheckString } = parseInitData(rawInitData);
      const expectedHash = getExpectedHash(botToken, dataCheckString);

      if (!safeEqualHex(hash, expectedHash)) {
        return next(unauthorized('Invalid Telegram authentication data'));
      }

      const authDate = Number(params.get('auth_date'));
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > now + 60 || now - authDate > maxAgeSeconds) {
        return next(unauthorized('Expired Telegram authentication data'));
      }

      const rawUser = params.get('user');
      if (!rawUser) return next(unauthorized('Telegram user data is required'));

      let user;
      try {
        user = JSON.parse(rawUser);
      } catch {
        return next(unauthorized('Invalid Telegram user data'));
      }

      if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
        return next(unauthorized('Invalid Telegram user identity'));
      }

      req.user = user;
      req.telegramInitData = params;
      return next();
    } catch (error) {
      if (error?.statusCode === 401) return next(error);
      return next(unauthorized('Invalid Telegram authentication data'));
    }
  };
}

module.exports = telegramAuth;
module.exports.telegramAuth = telegramAuth;
