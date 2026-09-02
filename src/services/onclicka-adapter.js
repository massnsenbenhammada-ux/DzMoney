const {
  ONCLICKA_SPOT_ID,
  ONCLICKA_ENABLED,
  ONCLICKA_PRIORITY,
  ONCLICKA_CONTEXTS
} = require('../config/onclicka');

const ONCLICKA_PROVIDER_ID = 'onclicka';
const ONCLICKA_SCRIPT_URL = 'https://js.onclckvd.com/in-stream-ad-admanager/tma.js';

function requiredUserId(value) {
  if (value === undefined || value === null || value === '') throw new Error('USERID is required');
  return String(value);
}

function verifyPostbackPayload(payload, spotId) {
  const userId = requiredUserId(payload.USERID ?? payload.userId);
  if (!payload.postbackConfirmed) throw new Error('OnClickA postback confirmation is required');
  if (payload.spot_id && String(payload.spot_id) !== spotId) throw new Error('Spot ID mismatch');
  return {
    verified: true,
    reference: `onclicka:${spotId}:${userId}`,
    metadata: { provider_id: ONCLICKA_PROVIDER_ID, spot_id: spotId, telegram_user_id: userId }
  };
}

function createOnclickaProvider(options = {}) {
  const spotId = String(options.spotId || ONCLICKA_SPOT_ID);
  return {
    id: ONCLICKA_PROVIDER_ID,
    contexts: [...ONCLICKA_CONTEXTS],
    enabled: options.enabled ?? ONCLICKA_ENABLED,
    priority: options.priority ?? ONCLICKA_PRIORITY,
    clientConfig: { scriptUrl: ONCLICKA_SCRIPT_URL, spotId },
    async verifyCompletion(payload = {}) { return verifyPostbackPayload(payload, spotId); },
    async verifyServerCompletion(payload = {}) {
      const result = verifyPostbackPayload(payload, spotId);
      const reference = String(payload.reference || result.reference);
      return { ...result, reference, userId: String(payload.USERID ?? payload.userId), providerId: ONCLICKA_PROVIDER_ID, context: 'task' };
    }
  };
}

module.exports = { ONCLICKA_PROVIDER_ID, createOnclickaProvider };
