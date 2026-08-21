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

router.post('/checkin/claim', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await daily.claimDailyCheckin({ userId, adEventId: req.body?.adEventId, idempotencyKey });
  res.json({ ok: true, ...result });
}));

module.exports = router;
