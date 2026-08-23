const express = require('express');
const { query } = require('../db/pool');
const { markAdvertisementVerified } = require('../services/ad-event-service');
const { finalizeDailyCheckin } = require('../services/daily-checkin-service');
const { verifyWithProvider } = require('../services/ad-provider-service');
const { MONETAG_PROVIDER_ID } = require('../services/monetag-adapter');

function createMonetagPostbackRouter({ providerRegistry, secret }) {
  const router = express.Router();
  if (!secret) throw new Error('Monetag postback secret is required');

  router.get('/', async (req, res, next) => {
    const payload = req.query;
    const logContext = {
      ymid: payload.ymid || null,
      eventType: payload.event_type || null,
      rewardEventType: payload.reward_event_type || null,
      zoneId: payload.zone_id || null,
      subZoneId: payload.sub_zone_id || null,
      requestVar: payload.request_var || null,
      telegramIdPresent: Boolean(payload.telegram_id)
    };
    console.info('[Monetag postback] stage=received', logContext);

    try {
      if (req.query.token !== secret) {
        console.warn('[Monetag postback] stage=rejected reason=unauthorized', logContext);
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const eventResult = await query(
        `SELECT a.id,a.user_id,a.context,a.external_ad_id,a.verified,u.telegram_user_id,d.claim_idempotency_key
         FROM activity_ad_events a
         JOIN users u ON u.id=a.user_id
         JOIN daily_checkins d ON d.ad_event_id=a.id
         WHERE a.context='daily_checkin' AND a.external_ad_id=$1`,
        [String(payload.ymid || '')]
      );
      if (eventResult.rowCount !== 1) {
        console.warn('[Monetag postback] stage=rejected reason=event_not_found', logContext);
        return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      }
      const event = eventResult.rows[0];
      if (payload.telegram_id && String(event.telegram_user_id) !== String(payload.telegram_id)) {
        console.warn('[Monetag postback] stage=rejected reason=user_mismatch', logContext);
        return res.status(403).json({ ok: false, error: 'Advertisement user does not match' });
      }
      console.info('[Monetag postback] stage=event_matched', logContext);
      const result = await verifyWithProvider(providerRegistry, {
        context: 'daily_checkin',
        providerId: MONETAG_PROVIDER_ID,
        payload
      });
      console.info('[Monetag postback] stage=validated', logContext);
      if (!result.verification.verified) {
        console.info('[Monetag postback] stage=not_verified', logContext);
        return res.status(202).json({ ok: true, verified: false });
      }
      const verified = await markAdvertisementVerified({
        adEventId: event.id,
        providerReference: result.verification.reference,
        verificationMetadata: result.verification.metadata
      });
      console.info('[Monetag postback] stage=verified', logContext);
      const reward = await finalizeDailyCheckin({ userId: event.user_id, claimIdempotencyKey: event.claim_idempotency_key });
      console.info('[Monetag postback] stage=finalized', { ...logContext, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded });
      return res.json({ ok: true, verified: true, duplicate: verified.duplicate || reward.duplicate, rewarded: reward.rewarded });
    } catch (error) {
      console.error('[Monetag postback] stage=error', { ...logContext, error: error.message });
      return next(error);
    }
  });

  return router;
}

module.exports = { createMonetagPostbackRouter };
