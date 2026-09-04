const express = require('express');
const { query } = require('../db/pool');
const { markAdvertisementVerified } = require('../services/ad-event-service');
const { finalizeDailyCheckin } = require('../services/daily-checkin-service');
const { finalizeTaskVerification, verifyTaskAdvertisement } = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const gamingService = require('../services/gaming-service');
const { verifyWithProvider } = require('../services/ad-provider-service');
const { MONETAG_PROVIDER_ID } = require('../services/monetag-adapter');
const { validateMonetagPostback } = require('../services/monetag-postback-service');
const { assertProviderSecret } = require('./provider-auth');
const { createRateLimit } = require('./rate-limit');

function createMonetagPostbackRouter({ providerRegistry, secret }) {
  const router = express.Router();
  if (!secret) throw new Error('Monetag postback secret is required');
  router.use(createRateLimit({ windowMs: 60_000, max: 60, key: req => `provider:${req.ip || 'unknown'}` }));

  router.get('/', async (req, res, next) => {
    const payload = req.query;
    console.info('[Monetag postback] received', { ymid: payload.ymid || null, eventType: payload.event_type || null, rewardEventType: payload.reward_event_type || null, zoneId: payload.zone_id || null, subZoneId: payload.sub_zone_id || null, requestVar: payload.request_var || null, telegramIdPresent: Boolean(payload.telegram_id) });
    try {
      assertProviderSecret(req, secret);
      const eventResult = await query(`SELECT a.id,a.user_id,a.context,a.external_ad_id,a.verified,u.telegram_user_id,d.claim_idempotency_key,g.attempt_id FROM activity_ad_events a JOIN users u ON u.id=a.user_id LEFT JOIN daily_checkins d ON d.ad_event_id=a.id LEFT JOIN task_verification_gates g ON g.ad_event_id=a.id WHERE a.context IN ('daily_checkin','verification','task','gaming') AND a.verified=FALSE AND a.metadata->>'provider_id'=$2 AND a.external_ad_id=$1`, [String(payload.ymid || ''), MONETAG_PROVIDER_ID]);
      if (eventResult.rowCount !== 1) return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      const event = eventResult.rows[0];
      validateMonetagPostback(payload, event.context);
      if (payload.telegram_id && String(event.telegram_user_id) !== String(payload.telegram_id)) return res.status(403).json({ ok: false, error: 'Advertisement user does not match' });

      if (event.context === 'gaming') {
        const result = await verifyWithProvider(providerRegistry, { context: 'gaming', providerId: MONETAG_PROVIDER_ID, payload });
        if (!result.verification.verified) return res.status(202).json({ ok: true, verified: false });
        const finalization = await gamingService.finalizeGamingAdvertisement({ userId: event.user_id, adEventId: event.id, providerReference: result.verification.reference, verificationMetadata: { ...result.verification.metadata, provider_id: result.providerId } });
        return res.json({ ok: true, context: event.context, verified: true, duplicate: finalization.duplicate, rewarded: finalization.rewarded, resourceGranted: finalization.resourceGranted || null, progress: finalization.progress || null });
      }

      if (event.context === 'task') {
        const verified = await taskAdvertisementService.verifyTrustedTaskAdvertisement({ providerId: MONETAG_PROVIDER_ID, providerPayload: payload, providerRegistry });
        if (!verified.adEvent) return res.status(202).json({ ok: true, verified: false });
        const finalization = await taskAdvertisementService.finalizeTaskAdvertisement({ userId: event.user_id, adEventId: event.id });
        return res.json({ ok: true, context: event.context, verified: true, duplicate: verified.duplicate || finalization.duplicate, rewarded: finalization.rewarded === true, progress: finalization.progress || null });
      }

      if (event.context === 'verification') {
        const verified = await verifyTaskAdvertisement({ adEventId: event.id, providerRegistry, providerId: MONETAG_PROVIDER_ID, providerPayload: payload });
        if (verified.verification && verified.verification.verified === false) return res.status(202).json({ ok: true, verified: false });
        const finalization = await finalizeTaskVerification({ attemptId: event.attempt_id, idempotencyKey: `task:${event.attempt_id}` });
        return res.json({ ok: true, context: event.context, verified: true, duplicate: verified.duplicate || finalization.duplicate, rewarded: finalization.rewarded === true, status: finalization.status, reason: finalization.reason || null });
      }

      const result = await verifyWithProvider(providerRegistry, { context: event.context, providerId: MONETAG_PROVIDER_ID, payload });
      if (!result.verification.verified) return res.status(202).json({ ok: true, verified: false });
      const verified = await markAdvertisementVerified({ adEventId: event.id, providerReference: result.verification.reference, verificationMetadata: { ...result.verification.metadata, provider_id: result.providerId } });
      const reward = await finalizeDailyCheckin({ userId: event.user_id, claimIdempotencyKey: event.claim_idempotency_key });
      return res.json({ ok: true, context: event.context, verified: true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded });
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createMonetagPostbackRouter };
