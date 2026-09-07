const GIGAPUB_PROVIDER_ID = 'gigapub';
const GIGAPUB_PROJECT_ID = String(process.env.GIGAPUB_PROJECT_ID || '7958');

function createGigaPubProvider() {
  return {
    id: GIGAPUB_PROVIDER_ID,
    contexts: ['gaming'],
    // Standard GigaPub Gaming currently exposes only a client completion Promise
    // in this integration. Never enable reward-bearing Gaming without a trusted
    // provider-side verification contract.
    enabled: false,
    clientConfig: { projectId: GIGAPUB_PROJECT_ID },
    async verifyCompletion() {
      throw new Error('GigaPub gaming completion requires trusted provider verification');
    }
  };
}

module.exports = { GIGAPUB_PROVIDER_ID, GIGAPUB_PROJECT_ID, createGigaPubProvider };
