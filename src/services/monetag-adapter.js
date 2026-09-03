const { MONETAG_ZONE_ID, MONETAG_CONTEXT, MONETAG_VERIFICATION_CONTEXT, MONETAG_TASK_CONTEXT, MONETAG_GAMING_CONTEXT } = require('../config/monetag');
const { validateMonetagPostback } = require('./monetag-postback-service');

const MONETAG_PROVIDER_ID = 'monetag';

function createMonetagProvider() {
  return {
    id: MONETAG_PROVIDER_ID,
    contexts: [MONETAG_CONTEXT, MONETAG_VERIFICATION_CONTEXT, MONETAG_TASK_CONTEXT, MONETAG_GAMING_CONTEXT],
    enabled: process.env.MONETAG_ENABLED === 'true',
    async verifyCompletion(payload = {}) {
      const normalized = validateMonetagPostback({ ...payload, zone_id: payload.zone_id || MONETAG_ZONE_ID });
      return { verified: normalized.eligible, reference: normalized.ymid, metadata: normalized };
    },
    async verifyServerCompletion(payload = {}) {
      const normalized = validateMonetagPostback({ ...payload, zone_id: payload.zone_id || MONETAG_ZONE_ID }, MONETAG_TASK_CONTEXT);
      if (!normalized.telegramId) return { verified: false, reference: normalized.ymid };
      return { verified: normalized.eligible, reference: normalized.ymid, userId: normalized.telegramId, providerId: MONETAG_PROVIDER_ID, context: MONETAG_TASK_CONTEXT, metadata: normalized };
    }
  };
}

module.exports = { MONETAG_PROVIDER_ID, createMonetagProvider };