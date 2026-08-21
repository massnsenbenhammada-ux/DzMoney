const express = require('express');
const { telegramAuth } = require('./telegram-auth');
const daily = require('../services/daily-checkin-service');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Production confirmation endpoint. AdsGram Reward URL supplies the Telegram user ID.
router.get('/adsgram/reward', asyncRoute(async (req, res) => {
  const telegramUserId = req.query.userid || req.query.userId;
  if (!telegramUserId) return res.status(400).json({ ok: false, error: 'userid is required' });
  const result = await daily.markLatestDailyAdCompletedByTelegramId(telegramUserId, req.query.adId || null);
  return res.json({ ok: true, ...result });
}));

router.use(telegramAuth);

router.get('/checkin', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  res.json(await daily.getDailyCheckin(userId));
}));

router.post('/checkin/ad/start', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await daily.startDailyCheckinAd({ userId, idempotencyKey, externalAdId: req.body?.externalAdId || null });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, adEvent: result.adEvent });
}));

// Development-only bridge for AdsGram debug/test ads. It is disabled unless explicitly enabled.
router.post('/checkin/ad/debug-complete', asyncRoute(async (req, res) => {
  if (process.env.ADSGRAM_DEBUG !== 'true') return res.status(404).json({ error: 'Not found' });
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const adEventId = req.body?.adEventId;
  const result = await daily.markDailyCheckinAdCompleted({ userId, adEventId, metadata: { adsgram_debug: true } });
  res.json({ ok: true, debug: true, ...result });
}));

router.post('/checkin/claim', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await daily.claimDailyCheckin({ userId, adEventId: req.body?.adEventId, idempotencyKey });
  res.json({ ok: true, ...result });
}));

module.exports = router;
