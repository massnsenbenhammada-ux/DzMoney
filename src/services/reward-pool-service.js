const { query } = require('../db/pool');

const DEFAULT_ACTIVATION_ADS = 10;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

async function getActivationTarget() {
  const result = await query("SELECT value FROM admin_settings WHERE key='reward_pool.activation_ads'");
  return positiveInteger(result.rows[0]?.value, DEFAULT_ACTIVATION_ADS);
}

async function getRewardPoolStatus({ userId }) {
  if (userId === undefined || userId === null || userId === '') throw new Error('userId is required');
  const activationTarget = await getActivationTarget();
  const result = await query(
    `SELECT COUNT(*)::int AS completed_ads
     FROM activity_ad_events
     WHERE user_id=$1 AND context='reward_pool' AND verified=TRUE`,
    [userId]
  );
  const completedAds = Number(result.rows[0]?.completed_ads || 0);
  const remainingAds = Math.max(activationTarget - completedAds, 0);
  const activated = completedAds >= activationTarget;
  return { activationTarget, completedAds, remainingAds, activated, locked: !activated };
}

module.exports = { getRewardPoolStatus };
