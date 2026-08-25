async function qualifyReferralFromActivityOnClient(client, args) {
  const { qualifyReferralFromActivityOnClient: qualify } = require('./referral-service');
  return qualify(client, args);
}

module.exports = { qualifyReferralFromActivityOnClient };
