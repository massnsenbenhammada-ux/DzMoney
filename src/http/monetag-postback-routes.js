const express = require('express');
const { query } = require('../db/pool');
const { markAdvertisementVerified } = require('../services/ad-event-service');
const { verifyWithProvider } = require('../services/ad-provider-service');
const { MONETAG_PROVIDER_ID } = require('../services/monetag-adapter');

function createMonetagPostbackRouter({ providerRegistry, secret }) {
  const router = express.Router();
  if (!secret) throw new Error('Monetag postback secret is required');

  router.get('/', async (req, res, next) => {
    try {
      if (req.query.token !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const payload = req.query;
      const eventResult = await query(
        `SELECT a.id,a.user_id,a.context,a.external_ad_id,a.verified,u.telegram_user_id
         FROM activity_ad_events a JOIN users u ON u.id=a.user_id
         WHERE a.context='daily_checkin' AND a.external_ad_id=$1`,
        [String(payload.ymid || '')]
      );
      if (eventResult.rowCount !== 1) return res.status(404).json({ ok: false, error: 'Advertisement event not found' });
      const event = eventResult.rows[0];
      if (String(event.telegram_user_id) !== String(payload.telegram_id)) return res.status(403).json({ ok: false, error: 'Advertisement user does not match' });
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
      return res.json({ ok: true, verified: true, duplicate: verified.duplicate });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createMonetagPostbackRouter };
