const express = require("express");
const walletService = require("../services/wallet-service");
const promoService = require("../services/promo-code-service");
const providerRegistryRuntime = require("../services/ad-provider-registry-runtime");
const { telegramAuth } = require("./telegram-auth");
const { createRateLimit } = require("./rate-limit");

function createPromoCodeRouter({
  wallet = walletService,
  promo = promoService,
  providerRegistry = providerRegistryRuntime,
  auth = telegramAuth,
} = {}) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);
  router.use(createRateLimit({ windowMs: 60_000, max: 30 }));

  async function currentUser(req) {
    return wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null,
    });
  }

  router.post(
    "/redeem",
    asyncRoute(async (req, res) => {
      const code = req.body?.code;
      const idempotencyKey = req.body?.idempotencyKey;
      if (typeof code !== "string" || !code.trim())
        return res
          .status(400)
          .json({ ok: false, error: "Promo code is required" });
      if (typeof idempotencyKey !== "string" || !idempotencyKey.trim())
        return res
          .status(400)
          .json({ ok: false, error: "idempotencyKey is required" });
      const user = await currentUser(req);
      const result = await promo.redeemPromoCode({
        userId: user.id,
        code,
        idempotencyKey,
        providerRegistry,
      });
      res.json({ ok: true, ...result });
    }),
  );

  router.get(
    "/redemption/:id",
    asyncRoute(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0)
        return res
          .status(400)
          .json({
            ok: false,
            error: "redemption id must be a positive integer",
          });
      const user = await currentUser(req);
      res.json({
        ok: true,
        redemption: await promo.getPromoRedemption({
          userId: user.id,
          redemptionId: id,
        }),
      });
    }),
  );

  return router;
}

module.exports = { createPromoCodeRouter };
