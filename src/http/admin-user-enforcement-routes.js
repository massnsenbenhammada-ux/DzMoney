const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');
const { getEnforcementState, setAccountStatus } = require('../services/admin-user-enforcement-service');

function createAdminUserEnforcementRouter() {
  const router = express.Router();
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 30 }));

  router.get('/:userId', async (req, res, next) => {
    try { res.json({ ok: true, ...(await getEnforcementState(req.params.userId)) }); }
    catch (error) { next(error); }
  });

  router.post('/:userId/status', async (req, res, next) => {
    try {
      const result = await setAccountStatus({
        userId: req.params.userId,
        action: req.body?.action,
        reason: req.body?.reason,
        evidence: req.body?.evidence,
        idempotencyKey: req.body?.idempotencyKey,
        actorTelegramUserId: req.adminTelegramUserId,
      });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAdminUserEnforcementRouter };
