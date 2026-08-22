const express = require('express');
const walletService = require('../services/wallet-service');
const dailyCheckinService = require('../services/daily-checkin-service');
const { telegramAuth } = require('./telegram-auth');

function createDailyCheckinRouter({ providerRegistry }) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(telegramAuth);
  router.post('/claim', asyncRoute(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    const result = await dailyCheckinService.startDailyCheckinClaim({
      userId: user.id,
      idempotencyKey: req.body?.idempotencyKey,
      providerRegistry,
      providerId: req.body?.providerId || null
    });
    res.json({ ok: true, ...result });
  }));

  return router;
}

async function getAuthenticatedUser(req) {
  const telegramUser = req.telegramUser;
  return walletService.createUser({
    telegramUserId: String(telegramUser.id),
    username: telegramUser.username || null,
    firstName: telegramUser.first_name || null,
    photoUrl: telegramUser.photo_url || null
  });
}

module.exports = { createDailyCheckinRouter };
