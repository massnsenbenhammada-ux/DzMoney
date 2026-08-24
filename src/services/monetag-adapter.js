const { MONETAG_ZONE_ID, MONETAG_CONTEXT, MONETAG_VERIFICATION_CONTEXT } = require('../config/monetag');
const { validateMonetagPostback } = require('./monetag-postback-service');

const MONETAG_PROVIDER_ID = 'monetag';

/** Adapt a validated Monetag postback to the shared advertisement verification contract. */
function createMonetagProvider() {
  return {
    id: MONETAG_PROVIDER_ID,
    contexts: [MONETAG_CONTEXT, MONETAG_VERIFICATION_CONTEXT],
    enabled: process.env.MONETAG_ENABLED === 'true',
    priority: 100,
    async verifyCompletion(payload = {}) {
      const normalized = validateMonetagPostback({ ...payload, zone_id: payload.zone_id || MONETAG_ZONE_ID });
      return {
        verified: normalized.eligible,
        reference: normalized.ymid,
        metadata: normalized
      };
    }
  };
}

module.exports = { MONETAG_PROVIDER_ID, createMonetagProvider };
