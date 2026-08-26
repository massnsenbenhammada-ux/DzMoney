-- Daily system task: Share with Friends.
-- Completion is Open Link / Click Proof: DzMoney records the authenticated
-- user's share-flow click, but does not claim proof that Telegram completed a share.
-- Eligibility resets at the UTC+1 calendar-day boundary through the existing
-- daily task attempt state.

INSERT INTO activity_tasks (
  task_type,
  title,
  description,
  reward_coin,
  reward_dzx,
  reward_dzp,
  verification_ad_seconds,
  status,
  config
)
SELECT
  'daily',
  'Share with Friends',
  'Share your personal DzMoney referral link with friends.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"systemKey":"share_with_friends","dailyPolicy":"utc_plus_one_calendar_day","completion":{"mode":"open_link","urlSource":"user_referral_link"},"verification":{"mode":"automatic"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND config->>'systemKey' = 'share_with_friends'
);
