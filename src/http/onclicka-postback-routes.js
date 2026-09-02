const express = require('express');
const { query } = require('../db/pool');
const { ONCLICKA_PROVIDER_ID } = require('../services/onclicka-adapter');
const { verifyDailyCheckinAd, finalizeDailyCheckin } = require('../services/daily-checkin-service');
const { verifyTaskAdvertisement, finalizeTaskVerification } = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const gamingService = require('../services/gaming-service');
const { createRateLimit } = require('./rate-limit');

const CONTEXTS = new Set(['task', 'daily_checkin', 'verification', 'gaming']);

function createOnclickaPostbackRouter({ providerRegistry }) {
  if (!providerRegistry) throw new Error('Advertisement provider registry is required');
  const router = express.Router();
  router.use(createRateLimit({ windowMs: 60_000, max: 60, key: req => `provider:${req.ip || 'unknown'}` }));

  const handlePostback = async (req, res, next) => {
    const userId = String(req.query.USERID || '');
    try {
      if (!userId || !/^\d{1,20}$/.test(userId)) return res.status(400).json({ ok: false, error: 'USERID is invalid' });

      const eventResult = await query(
        `SELECT a.id,a.user_id,a.context,a.verified,a.external_ad_id,a.metadata,d.claim_idempotency_key,g.attempt_id,u.telegram_user_id
         FROM activity_ad_events a
         JOIN users u ON u.id=a.user_id
         LEFT JOIN daily_checkins d ON d.ad_event_id=a.id
         LEFT JOIN task_verification_gates g ON g.ad_event_id=a.id
         WHERE a.context = ANY($1::text[])
           AND a.verified=FALSE
           AND a.metadata->>'provider_id'=$2
           AND u.telegram_user_id=$3
         ORDER BY a.started_at DESC
         LIMIT 2`,
        [[...CONTEXTS], ONCLICKA_PROVIDER_ID, userId]
      );
      if (eventResult.rowCount !== 1) {
        if (eventResult.rowCount > 1) return res.status(409).json({ ok: false, error: 'Multiple pending advertisement events found' });
        return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      }

      const event = eventResult.rows[0];
      const context = event.context;
      const providerPayload = { USERID: userId, postbackConfirmed: true };
      if (context === 'task') {
        const verified = await taskAdvertisementService.verifyTrustedTaskAdvertisement({
          providerId: ONCLICKA_PROVIDER_ID,
          providerPayload: { ...providerPayload, reference: event.external_ad_id },
          providerRegistry
        });
        if (!verified.adEvent) return res.status(202).json({ ok: true, context, verified: false });
        const finalization = await taskAdvertisementService.finalizeTaskAdvertisement({ userId: event.user_id, adEventId: event.id });
        return res.json({ ok: true, context, verified: true, duplicate: verified.duplicate || finalization.duplicate, rewarded: finalization.rewarded === true, progress: finalization.progress || null });
      }
      if (context === 'gaming') {
        const provider = providerRegistry.get(ONCLICKA_PROVIDER_ID);
        const verification = await provider.verifyCompletion(providerPayload);
        const finalization = await gamingService.finalizeGamingAdvertisement({
          userId: event.user_id,
          adEventId: event.id,
          providerReference: verification.reference,
          verificationMetadata: { ...verification.metadata, postbackConfirmed: true }
        });
        return res.json({ ok: true, context, verified: verification.verified === true, duplicate: finalization.duplicate, rewarded: finalization.rewarded, resourceGranted: finalization.resourceGranted || null, progress: finalization.progress || null });
      }
      if (context === 'daily_checkin') {
        const verified = await verifyDailyCheckinAd({
          userId: event.user_id,
          adEventId: event.id,
          providerRegistry,
          providerId: ONCLICKA_PROVIDER_ID,
          providerPayload
        });
        const reward = await finalizeDailyCheckin({ userId: event.user_id, claimIdempotencyKey: event.claim_idempotency_key });
        return res.json({ ok: true, context, verified: verified.duplicate || true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded === true });
      }

      const verified = await verifyTaskAdvertisement({
        adEventId: event.id,
        providerRegistry,
        providerId: ONCLICKA_PROVIDER_ID,
        providerPayload
      });
      const finalization = await finalizeTaskVerification({ attemptId: event.attempt_id, idempotencyKey: `task:${event.attempt_id}` });
      return res.json({ ok: true, context, verified: verified.duplicate || true, duplicate: verified.duplicate || finalization.duplicate, rewarded: finalization.rewarded === true, status: finalization.status });
    } catch (error) {
      return next(error);
    }
  };

  // OnClickA confirms views with one configured handler URL plus USERID; context is resolved from the pending event.
  router.get('/', handlePostback);
  router.get('/:context', (req, res, next) => {
    if (!CONTEXTS.has(req.params.context)) return res.status(404).json({ ok: false, error: 'Unsupported advertisement context' });
    return handlePostback(req, res, next);
  });

  return router;
}

module.exports = { createOnclickaPostbackRouter };
