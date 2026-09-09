const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');
const {
  getEconomySettings,
  setEconomySetting,
} = require('../services/admin-settings-service');

function createAdminEconomyRouter() {
  const router = express.Router();
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ ok: true, settings: await getEconomySettings() });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:key', async (req, res, next) => {
    try {
      const result = await setEconomySetting({
        key: req.params.key,
        value: req.body?.value,
        actorTelegramUserId: req.adminTelegramUserId,
      });
      res.json({ ok: true, setting: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminEconomyRouter };
