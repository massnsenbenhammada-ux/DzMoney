const { ADSGRAM_PROVIDER_ID, ADSGRAM_BLOCK_ID, ADSGRAM_ENABLED, assertAdsgramConfiguration } = require('../config/adsgram');

const ADSGRAM_CONTEXTS = ['task', 'squad'];

function createAdsgramProvider() {
  assertAdsgramConfiguration();
  return {
    id: ADSGRAM_PROVIDER_ID,
    contexts: ADSGRAM_CONTEXTS,
    enabled: ADSGRAM_ENABLED,
    async verifyCompletion(payload = {}) {
      const verified = payload.providerConfirmed === true && payload.clientCompleted === true;
      return { verified, reference: String(payload.reference || ''), metadata: { blockId: ADSGRAM_BLOCK_ID } };
    },
    async verifyServerCompletion(payload = {}) {
      const userId = payload.userId == null ? null : String(payload.userId);
      const reference = payload.reference == null ? '' : String(payload.reference);
      const blockId = payload.blockId == null ? '' : String(payload.blockId);
      const context = payload.context == null ? '' : String(payload.context);
      const verified = payload.providerConfirmed === true && payload.clientCompleted === true && blockId === ADSGRAM_BLOCK_ID && ADSGRAM_CONTEXTS.includes(context) && Boolean(userId) && Boolean(reference);
      return { verified, reference, userId, providerId: ADSGRAM_PROVIDER_ID, context, metadata: { blockId, source: 'adsgram_reward_url' } };
    }
  };
}

module.exports = { ADSGRAM_PROVIDER_ID, ADSGRAM_BLOCK_ID, ADSGRAM_CONTEXTS, createAdsgramProvider };
