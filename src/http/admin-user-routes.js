const express = require("express");
const { adminAuth } = require("./admin-auth");
const { createRateLimit } = require("./rate-limit");
const {
  searchUsers,
  getUserProfile,
  adjustBalance,
} = require("../services/admin-user-service");

function createAdminUserRouter() {
  const router = express.Router();
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get("/", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        users: await searchUsers(req.query.q, req.query.limit),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:userId", async (req, res, next) => {
    try {
      res.json({ ok: true, ...(await getUserProfile(req.params.userId)) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:userId/balance-adjustment", async (req, res, next) => {
    try {
      const result = await adjustBalance({
        userId: req.params.userId,
        currency: req.body?.currency,
        amount: req.body?.amount,
        reason: req.body?.reason,
        dzpSource: req.body?.dzpSource,
        idempotencyKey: req.body?.idempotencyKey,
        actorTelegramUserId: req.adminTelegramUserId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminUserRouter };
