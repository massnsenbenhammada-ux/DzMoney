const { ADSGRAM_PROVIDER_ID, ADSGRAM_BLOCK_ID, ADSGRAM_ENABLED, assertAdsgramConfiguration } = require('../config/adsgram');

function createAdsgramProvider() {
  assertAdsgramConfiguration();
  return {
    id: ADSGRAM_PROVIDER_ID,
    contexts: ['task'],
    enabled: ADSGRAM_ENABLED,
    async verifyCompletion(payload = {}) {
      const verified = payload.providerConfirmed === true && payload.clientCompleted === true;
      return { verified, reference: String(payload.reference || ''), metadata: { blockId: ADSGRAM_BLOCK_ID } };
    },
    async verifyServerCompletion(payload = {}) {
      const userId = payload.userId == null ? null : String(payload.userId);
      const reference = payload.reference == null ? '' : String(payload.reference);
      const blockId = payload.blockId == null ? '' : String(payload.blockId);
      const verified = payload.providerConfirmed === true && payload.clientCompleted === true && blockId === ADSGRAM_BLOCK_ID && Boolean(userId) && Boolean(reference);
      return { verified, reference, userId, providerId: ADSGRAM_PROVIDER_ID, context: 'task', metadata: { blockId, source: 'adsgram_reward_url' } };
    }
  };
}

module.exports = { ADSGRAM_PROVIDER_ID, ADSGRAM_BLOCK_ID, createAdsgramProvider };
