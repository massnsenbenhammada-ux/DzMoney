const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');
const { getReferralSettings, setReferralSetting } = require('../services/admin-referral-service');

function createAdminReferralRouter() {
  const router = express.Router();
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/', async (req, res, next) => {
    try {
      res.json({ ok: true, settings: await getReferralSettings(), qualification: { sources: ['task', 'advertisement'], rule: 'one verified task or advertisement' } });
    } catch (error) { next(error); }
  });

  router.put('/:key', async (req, res, next) => {
    try {
      const result = await setReferralSetting({ key: req.params.key, value: req.body?.value, actorTelegramUserId: req.adminTelegramUserId });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAdminReferralRouter };
