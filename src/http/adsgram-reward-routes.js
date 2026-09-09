const express = require("express");
const { ADSGRAM_BLOCK_ID, ADSGRAM_ENABLED } = require("../config/adsgram");
const adsgramCorrelation = require("../services/adsgram-correlation-service");
const taskAdvertisementService = require("../services/task-advertisement-service");
const walletService = require("../services/wallet-service");

function createAdsgramRewardRouter() {
  const router = express.Router();
  router.get("/", async (req, res, next) => {
    try {
      if (!ADSGRAM_ENABLED)
        return res
          .status(404)
          .json({ ok: false, error: "AdsGram is disabled" });
      const telegramId = String(req.query?.userid || req.query?.userId || "");
      if (!/^\d+$/.test(telegramId))
        return res
          .status(400)
          .json({ ok: false, error: "AdsGram userid is required" });
      const reference = `adsgram:${telegramId}:${ADSGRAM_BLOCK_ID}:${Date.now()}`;
      const confirmed = await adsgramCorrelation.markProviderConfirmed({
        userTelegramId: telegramId,
        providerReference: reference,
      });
      if (!confirmed.ready)
        return res.json({
          ok: true,
          provider: "adsgram",
          blockId: ADSGRAM_BLOCK_ID,
          confirmed: true,
          verified: false,
          pendingClientConfirmation: true,
        });
      const user = await walletService.createUser({
        telegramUserId: telegramId,
      });
      const finalization =
        await taskAdvertisementService.finalizeTaskAdvertisement({
          userId: user.id,
          adEventId: confirmed.adEvent.id,
        });
      return res.json({
        ok: true,
        provider: "adsgram",
        blockId: ADSGRAM_BLOCK_ID,
        confirmed: true,
        verified: true,
        rewarded: finalization.rewarded === true,
        duplicate: finalization.duplicate,
        progress: finalization.progress || null,
      });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
module.exports = { createAdsgramRewardRouter };
