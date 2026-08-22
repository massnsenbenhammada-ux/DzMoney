const { validateMonetagPostback, MONETAG_ZONE_ID, MONETAG_CONTEXT } = require('./monetag-postback-service');

const MONETAG_PROVIDER_ID = 'monetag';

/** Adapt a validated Monetag postback to the shared advertisement verification contract. */
function createMonetagProvider({ zoneId = process.env.MONETAG_ZONE_ID || MONETAG_ZONE_ID } = {}) {
  return {
    id: MONETAG_PROVIDER_ID,
    contexts: [MONETAG_CONTEXT],
    enabled: process.env.MONETAG_ENABLED === 'true',
    priority: 100,
    async verifyCompletion(payload = {}) {
      const normalized = validateMonetagPostback({ ...payload, zone_id: payload.zone_id || zoneId });
      return {
        verified: normalized.eligible,
        reference: normalized.ymid,
        metadata: normalized
      };
    }
  };
}

module.exports = { MONETAG_PROVIDER_ID, createMonetagProvider };
