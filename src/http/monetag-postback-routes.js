const express = require('express');
const { query } = require('../db/pool');
const { markAdvertisementVerified } = require('../services/ad-event-service');
const { finalizeDailyCheckin } = require('../services/daily-checkin-service');
const { verifyTaskAdvertisement, finalizeTaskVerification } = require('../services/task-verification-service');
const { verifyWithProvider } = require('../services/ad-provider-service');
const { MONETAG_PROVIDER_ID } = require('../services/monetag-adapter');

function createMonetagPostbackRouter({ providerRegistry, secret }) {
  const router = express.Router();
  if (!secret) throw new Error('Monetag postback secret is required');

  router.get('/', async (req, res, next) => {
    const payload = req.query;
    console.info('[Monetag postback] received', {
      ymid: payload.ymid || null,
      eventType: payload.event_type || null,
      rewardEventType: payload.reward_event_type || null,
      zoneId: payload.zone_id || null,
      subZoneId: payload.sub_zone_id || null,
      requestVar: payload.request_var || null,
      telegramIdPresent: Boolean(payload.telegram_id)
    });

    try {
      if (req.query.token !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const eventResult = await query(
        `SELECT a.id,a.user_id,a.context,a.external_ad_id,a.verified,u.telegram_user_id,
                d.claim_idempotency_key,ta.id AS attempt_id
         FROM activity_ad_events a
         JOIN users u ON u.id=a.user_id
         LEFT JOIN daily_checkins d ON d.ad_event_id=a.id
         LEFT JOIN task_verification_gates tg ON tg.ad_event_id=a.id
         LEFT JOIN task_attempts ta ON ta.id=tg.attempt_id
         WHERE a.external_ad_id=$1 AND a.context IN ('daily_checkin','verification')`,
        [String(payload.ymid || '')]
      );
      if (eventResult.rowCount !== 1) return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      const event = eventResult.rows[0];
      if (payload.telegram_id && String(event.telegram_user_id) !== String(payload.telegram_id)) {
        return res.status(403).json({ ok: false, error: 'Advertisement user does not match' });
      }

      if (event.context === 'verification') {
        const verified = await verifyTaskAdvertisement({
          adEventId: event.id,
          providerRegistry,
          providerId: MONETAG_PROVIDER_ID,
          providerPayload: payload
        });
        const finalized = await finalizeTaskVerification({
          attemptId: event.attempt_id,
          idempotencyKey: `task-reward:${event.attempt_id}`
        });
        return res.json({ ok: true, verified: true, duplicate: Boolean(verified.duplicate || finalized.duplicate), rewarded: Boolean(finalized.rewarded), status: finalized.status });
      }

      const result = await verifyWithProvider(providerRegistry, {
        context: 'daily_checkin',
        providerId: MONETAG_PROVIDER_ID,
        payload
      });
      if (!result.verification.verified) return res.status(202).json({ ok: true, verified: false });
      const verified = await markAdvertisementVerified({
        adEventId: event.id,
        providerReference: result.verification.reference,
        verificationMetadata: result.verification.metadata
      });
      const reward = await finalizeDailyCheckin({ userId: event.user_id, claimIdempotencyKey: event.claim_idempotency_key });
      return res.json({ ok: true, verified: true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createMonetagPostbackRouter };
