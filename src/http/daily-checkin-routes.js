const express = require('express');
const walletService = require('../services/wallet-service');
const dailyCheckinService = require('../services/daily-checkin-service');
const { telegramAuth } = require('./telegram-auth');
const { createRateLimit } = require('./rate-limit');

function createDailyCheckinRouter({ providerRegistry }) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(telegramAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/status', asyncRoute(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    res.json({ ok: true, ...(await dailyCheckinService.getDailyCheckinStatus({ userId: user.id })) });
  }));

  router.post('/claim', createRateLimit({ windowMs: 60_000, max: 10 }), asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'request body must be an object' });
    const allowed = new Set(['idempotencyKey', 'providerId']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ ok: false, error: 'unknown request field' });
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    if (body.providerId !== undefined && body.providerId !== null && typeof body.providerId !== 'string') return res.status(400).json({ ok: false, error: 'providerId must be a string' });

    const user = await getAuthenticatedUser(req);
    const result = await dailyCheckinService.startDailyCheckinClaim({
      userId: user.id,
      idempotencyKey: body.idempotencyKey,
      providerRegistry,
      providerId: body.providerId || null
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
