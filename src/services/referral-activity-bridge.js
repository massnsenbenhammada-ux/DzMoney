async function qualifyReferralFromActivityOnClient(client, args) {
  const { qualifyReferralFromActivityOnClient: qualify } = require('./referral-service');
  return qualify(client, { ...args, baseReward: { coin: Number(args.baseReward?.coin || 0), dzx: Number(args.baseReward?.dzx || 0), dzp: 0 } });
}

module.exports = { qualifyReferralFromActivityOnClient };
