const BOT_USERNAME = 'DzaMoneybot';
const MINI_APP_SHORT_NAME = 'DzMoney';

function buildReferralLink(referralCode) {
  if (!referralCode) throw new Error('Referral code is required');
  return `https://t.me/${BOT_USERNAME}/${MINI_APP_SHORT_NAME}?startapp=${encodeURIComponent(referralCode)}`;
}

module.exports = { BOT_USERNAME, MINI_APP_SHORT_NAME, buildReferralLink };
