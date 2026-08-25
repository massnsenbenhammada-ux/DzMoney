const UTC_PLUS_ONE_OFFSET_MS = 60 * 60 * 1000;

const DAILY_SYSTEM_TASKS = Object.freeze({
  CHECK_IN: 'daily_check_in',
  CHECK_FOR_UPDATE: 'check_for_update',
  SHARE_WITH_FRIENDS: 'share_with_friends',
  VIEW_ADS: 'view_ads',
  INVITE_1_FRIEND: 'invite_1_friend',
  INVITE_10_FRIENDS: 'invite_10_friends',
  INVITE_20_FRIENDS: 'invite_20_friends',
  INVITE_50_FRIENDS: 'invite_50_friends',
  INVITE_100_FRIENDS: 'invite_100_friends',
});

const REFERRAL_ACHIEVEMENT_THRESHOLDS = Object.freeze({
  [DAILY_SYSTEM_TASKS.INVITE_1_FRIEND]: 1,
  [DAILY_SYSTEM_TASKS.INVITE_10_FRIENDS]: 10,
  [DAILY_SYSTEM_TASKS.INVITE_20_FRIENDS]: 20,
  [DAILY_SYSTEM_TASKS.INVITE_50_FRIENDS]: 50,
  [DAILY_SYSTEM_TASKS.INVITE_100_FRIENDS]: 100,
});

/**
 * Returns whether a UTC+1 calendar day boundary has been crossed.
 * @param {Date|string|number} previousAt Previous successful completion time.
 * @param {Date|string|number} now Current time.
 * @returns {boolean} True when the UTC+1 calendar date differs.
 */
function isUtcPlusOneCalendarDayAvailable(previousAt, now) {
  const previousDate = utcPlusOneDateKey(previousAt);
  const currentDate = utcPlusOneDateKey(now);
  return previousDate !== currentDate;
}

/**
 * Returns whether a permanent referral achievement can be claimed.
 * @param {number} qualifiedReferrals Number of qualified referrals.
 * @param {number} threshold Required referral threshold.
 * @param {boolean} completed Whether this threshold was already claimed.
 * @returns {boolean} True when the achievement is claimable.
 */
function isReferralAchievementClaimable(qualifiedReferrals, threshold, completed) {
  return Number.isInteger(qualifiedReferrals)
    && Number.isInteger(threshold)
    && threshold > 0
    && qualifiedReferrals >= threshold
    && completed === false;
}

function utcPlusOneDateKey(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('Invalid date');
  }

  return new Date(timestamp + UTC_PLUS_ONE_OFFSET_MS).toISOString().slice(0, 10);
}

module.exports = {
  DAILY_SYSTEM_TASKS,
  REFERRAL_ACHIEVEMENT_THRESHOLDS,
  isUtcPlusOneCalendarDayAvailable,
  isReferralAchievementClaimable,
};
