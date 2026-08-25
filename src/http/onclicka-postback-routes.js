const express = require('express');
const { query } = require('../db/pool');
const { ONCLICKA_PROVIDER_ID } = require('../services/onclicka-adapter');
const { verifyDailyCheckinAd, finalizeDailyCheckin } = require('../services/daily-checkin-service');
const { verifyTaskAdvertisement, finalizeTaskVerification } = require('../services/task-verification-service');
const { finalizeVerifiedAchievementAd } = require('../services/referral-postback-adapter');

const CONTEXTS = new Set(['daily_checkin', 'verification', 'achievement']);

function createOnclickaPostbackRouter({ providerRegistry, secret }) {
  if (!providerRegistry) throw new Error('Advertisement provider registry is required');
  if (!secret) throw new Error('OnClickA confirmation secret is required');
  const router = express.Router();

  router.get('/:context', async (req, res, next) => {
    const context = req.params.context;
    const userId = String(req.query.USERID || '');
    try {
      if (!CONTEXTS.has(context)) return res.status(404).json({ ok: false, error: 'Unsupported advertisement context' });
      if (req.query.token !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      if (!userId) return res.status(400).json({ ok: false, error: 'USERID is required' });

      const eventResult = await query(
        `SELECT a.id,a.user_id,a.context,a.verified,a.metadata,d.claim_idempotency_key,g.attempt_id,u.telegram_user_id
         FROM activity_ad_events a
         JOIN users u ON u.id=a.user_id
         LEFT JOIN daily_checkins d ON d.ad_event_id=a.id
         LEFT JOIN task_verification_gates g ON g.ad_event_id=a.id
         WHERE a.context=$1
           AND a.verified=FALSE
           AND a.metadata->>'provider_id'=$2
           AND u.telegram_user_id=$3
         ORDER BY a.started_at DESC
         LIMIT 2`,
        [context, ONCLICKA_PROVIDER_ID, userId]
      );
      if (eventResult.rowCount !== 1) {
        if (eventResult.rowCount > 1) return res.status(409).json({ ok: false, error: 'Multiple pending advertisement events found' });
        return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      }

      const event = eventResult.rows[0];
      const providerPayload = { USERID: userId, confirmedByPostback: true };
      if (context === 'achievement') {
        const result = await finalizeVerifiedAchievementAd({ event, providerRegistry, providerId: ONCLICKA_PROVIDER_ID, providerPayload });
        return res.json({ ok: true, context, verified: result.verified, duplicate: result.duplicate, rewarded: result.rewarded === true });
      }
      if (context === 'daily_checkin') {
        const verified = await verifyDailyCheckinAd({ userId: event.user_id, adEventId: event.id, providerRegistry, providerId: ONCLICKA_PROVIDER_ID, providerPayload });
        const reward = await finalizeDailyCheckin({ userId: event.user_id, claimIdempotencyKey: event.claim_idempotency_key });
        return res.json({ ok: true, context, verified: verified.duplicate || true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded === true });
      }

      const verified = await verifyTaskAdvertisement({ adEventId: event.id, providerRegistry, providerId: ONCLICKA_PROVIDER_ID, providerPayload });
      const finalization = await finalizeTaskVerification({ attemptId: event.attempt_id, idempotencyKey: `task:${event.attempt_id}` });
      return res.json({ ok: true, context, verified: verified.duplicate || true, duplicate: verified.duplicate || finalization.duplicate, rewarded: finalization.rewarded === true, status: finalization.status });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createOnclickaPostbackRouter };
