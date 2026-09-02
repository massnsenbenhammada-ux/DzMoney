const express = require('express');
const { telegramAuth } = require('./telegram-auth');
const { query } = require('../db/pool');
const walletService = require('../services/wallet-service');
const { convertCoinToDzp, convertDzxToDzp } = require('../services/economy-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function idempotencyKey(req) {
  const value = req.get('Idempotency-Key');
  if (!value || value.length > 200) {
    const error = new Error('Idempotency-Key header is required');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function amount(body, field) {
  const value = body?.[field];
  if (typeof value !== 'string' && typeof value !== 'number') {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

router.use(telegramAuth);

router.get('/rates', asyncRoute(async (_req, res) => {
  const result = await query(`SELECT key, value FROM admin_settings WHERE key IN ('economy.coin_per_dzp','economy.dzx_per_dzp','economy.dzx_per_ton') ORDER BY key`);
  res.json({ ok: true, rates: Object.fromEntries(result.rows.map(row => [row.key, row.value])) });
}));

router.post('/coin-to-dzp', asyncRoute(async (req, res) => {
  const user = await walletService.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
  const result = await convertCoinToDzp({ idempotencyKey: idempotencyKey(req), userId: user.id, coin: amount(req.body, 'coin') });
  res.json({ ok: true, ...result });
}));

router.post('/dzx-to-dzp', asyncRoute(async (req, res) => {
  const user = await walletService.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
  const result = await convertDzxToDzp({ idempotencyKey: idempotencyKey(req), userId: user.id, dzx: amount(req.body, 'dzx') });
  res.json({ ok: true, ...result });
}));

module.exports = router;
