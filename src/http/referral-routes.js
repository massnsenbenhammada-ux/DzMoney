const express = require('express');
const walletService = require('../services/wallet-service');
const referralService = require('../services/referral-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');

function createReferralRouter({ wallet = walletService, referral = referralService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);

  async function currentUser(req) {
    return wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
  }

  router.get('/me', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    res.json({ ok: true, ...(await referral.getReferralOverview(user.id)) });
  }));

  router.post('/attribute', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    const result = await referral.attributeReferral({ referredUserId: user.id, referralCode: req.body?.referralCode });
    res.json({ ok: true, duplicate: result.duplicate, attributionId: result.attribution.id, status: result.attribution.status });
  }));

  router.post('/achievement/:milestone/start', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    const result = await referral.startAchievementClaim({
      userId: user.id,
      milestone: req.params.milestone,
      providerRegistry,
      providerId: req.body?.providerId || null
    });
    res.json({
      ok: true,
      duplicate: result.duplicate,
      claimed: result.claimed,
      milestone: Number(result.achievement.milestone),
      claimId: result.claim?.id || null,
      adEventId: result.adEvent?.id || null,
      verificationAdId: result.adEvent?.external_ad_id || null,
      providerId: result.providerId || result.adEvent?.metadata?.provider_id || null
    });
  }));

  router.get('/achievement/:milestone/status', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    res.json({ ok: true, ...(await referral.getAchievementClaimStatus({ userId: user.id, milestone: req.params.milestone })) });
  }));

  router.post('/achievement/:milestone/finalize', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    const result = await referral.finalizeAchievementClaim({ userId: user.id, milestone: req.params.milestone });
    res.json({ ok: true, rewarded: result.rewarded === true, duplicate: result.duplicate, rewardTransactionId: result.reward?.transaction?.id || result.rewardTransactionId || null });
  }));

  router.post('/achievement-ad/verify', asyncRoute(async (req, res) => {
    const user = await currentUser(req);
    const result = await referral.verifyAchievementAdvertisement({
      userId: user.id,
      adEventId: req.body?.adEventId,
      providerRegistry,
      providerId: req.body?.providerId || null,
      providerPayload: req.body?.providerPayload
    });
    res.json({ ok: true, verified: result.verified !== false, duplicate: result.duplicate === true, adEventId: result.adEvent.id });
  }));

  return router;
}

module.exports = { createReferralRouter };
