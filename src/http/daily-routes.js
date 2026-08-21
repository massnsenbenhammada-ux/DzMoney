const express = require('express');
const { telegramAuth } = require('./telegram-auth');
const daily = require('../services/daily-checkin-service');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.use(telegramAuth);

router.get('/checkin', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  res.json(await daily.getDailyCheckin(userId));
}));

router.post('/checkin/ad/start', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await daily.startDailyCheckinAd({
    userId,
    idempotencyKey,
    externalAdId: req.body?.externalAdId || null,
  });
  res.status(result.duplicate ? 200 : 201).json({
    ok: true,
    duplicate: result.duplicate,
    adEvent: result.adEvent,
  });
}));

router.post('/checkin/claim', asyncRoute(async (req, res) => {
  const userId = await daily.resolveUserIdFromTelegram(req.telegramUser.id);
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await daily.claimDailyCheckin({
    userId,
    adEventId: req.body?.adEventId,
    idempotencyKey,
  });
  res.json({ ok: true, ...result });
}));

module.exports = router;
