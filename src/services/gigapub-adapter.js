const GIGAPUB_PROVIDER_ID = 'gigapub';
const GIGAPUB_PROJECT_ID = String(process.env.GIGAPUB_PROJECT_ID || '7958');

function createGigaPubProvider() {
  return {
    id: GIGAPUB_PROVIDER_ID,
    contexts: ['gaming'],
    enabled: process.env.GIGAPUB_ENABLED === 'true',
    priority: 200,
    clientConfig: { projectId: GIGAPUB_PROJECT_ID },
    async verifyCompletion(payload = {}) {
      const userId = String(payload.userId || '');
      const adEventId = String(payload.adEventId || '');
      if (!userId || !adEventId) throw new Error('GigaPub gaming completion requires an authenticated ad event');
      return {
        verified: true,
        reference: `gigapub:${GIGAPUB_PROJECT_ID}:${adEventId}`,
        metadata: { provider_id: GIGAPUB_PROVIDER_ID, project_id: GIGAPUB_PROJECT_ID }
      };
    }
  };
}

module.exports = { GIGAPUB_PROVIDER_ID, GIGAPUB_PROJECT_ID, createGigaPubProvider };
