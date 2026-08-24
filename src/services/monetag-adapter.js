const { MONETAG_ZONE_ID, MONETAG_CONTEXT } = require('../config/monetag');
const { validateMonetagPostback } = require('./monetag-postback-service');

const MONETAG_PROVIDER_ID = 'monetag';
const MONETAG_CONTEXTS = [MONETAG_CONTEXT, 'verification'];

/** Adapt a validated Monetag postback to the shared advertisement verification contract. */
function createMonetagProvider() {
  return {
    id: MONETAG_PROVIDER_ID,
    contexts: MONETAG_CONTEXTS,
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
