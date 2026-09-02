const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const gaming = require('../services/gaming-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(telegramAuth);

async function currentUserId(req) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id=$1', [String(req.telegramUser.id)]);
  return result.rows[0]?.id || null;
}

function idempotency(req) {
  const key = String(req.body?.idempotencyKey || '');
  if (!key || key.length > 160) throw Object.assign(new Error('idempotencyKey is required'), { statusCode: 400 });
  return key;
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  res.json({ ok: true, gaming: await gaming.getGamingState({ userId }) });
}));

router.post('/spin', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.spin({ userId, idempotencyKey: idempotency(req) });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, result: result.result, transactionId: result.transaction?.id ? String(result.transaction.id) : null });
}));

router.post('/digging/start', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.startDigging({ userId });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, session: result.session });
}));

router.post('/digging/reveal', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.revealDiggingTile({ userId, sessionId: req.body?.sessionId, tileId: req.body?.tileId });
  res.json({ ok: true, duplicate: result.duplicate, tile: result.tile, session: result.session, transactionId: result.transaction?.id ? String(result.transaction.id) : null });
}));

router.post('/ads/start', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.startGamingAdvertisement({ userId, game: String(req.body?.game || ''), idempotencyKey: idempotency(req), providerRegistry: req.app.locals.adProviderRegistry });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, adEventId: String(result.adEvent.id), externalAdId: result.adEvent.external_ad_id, providerId: result.providerId });
}));

module.exports = router;
