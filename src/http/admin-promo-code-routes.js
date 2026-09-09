const express = require('express');
const promoService = require('../services/promo-code-service');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');

function createAdminPromoCodeRouter({ promo = promoService } = {}) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      res.json({ ok: true, campaigns: await promo.listPromoCampaigns() });
    }),
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const result = await promo.createPromoCampaign(req.body || {});
      res.status(201).json({ ok: true, campaign: result });
    }),
  );

  router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
      const result = await promo.updatePromoCampaign(
        Number(req.params.id),
        req.body || {},
        req.adminTelegramUserId,
      );
      res.json({ ok: true, campaign: result });
    }),
  );

  return router;
}

module.exports = { createAdminPromoCodeRouter };
