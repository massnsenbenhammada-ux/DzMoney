const referralService = require('./referral-service');

async function finalizeVerifiedAchievementAd({ event, providerRegistry, providerId, providerPayload }) {
  const verified = await referralService.verifyAchievementAdvertisement({
    userId: event.user_id,
    adEventId: event.id,
    providerRegistry,
    providerId,
    providerPayload
  });
  if (verified.verified === false) return { verified: false, duplicate: false };
  const milestone = Number(event.metadata?.milestone);
  if (!Number.isInteger(milestone) || milestone <= 0) throw new Error('Referral achievement milestone is invalid');
  const reward = await referralService.finalizeAchievementClaim({ userId: event.user_id, milestone });
  return { verified: true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded === true, reward };
}

module.exports = { finalizeVerifiedAchievementAd };
