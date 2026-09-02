const express = require('express');
const { adminAuth } = require('./admin-auth');
const { getConfig, updateGamingConfig } = require('../services/gaming-service');

function createAdminGamingRouter() {
  const router = express.Router();
  router.use(adminAuth);

  router.get('/config', async (_req, res, next) => {
    try {
      const config = await getConfig();
      res.json({ ok: true, version: config.version, config: config.config });
    } catch (error) {
      next(error);
    }
  });

  router.put('/config', async (req, res, next) => {
    try {
      const result = await updateGamingConfig({ config: req.body?.config, actorTelegramUserId: req.adminTelegramUserId });
      res.json({ ok: true, version: result.version, config: result.config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminGamingRouter };
