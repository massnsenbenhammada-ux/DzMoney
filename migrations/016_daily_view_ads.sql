-- Daily system task: View Ads.
-- The advertisement itself is the completion event; it does not receive a second verification ad.

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
  'View Ads',
  'Watch an available DzMoney advertisement to complete the daily activity.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"systemKey":"view_ads","dailyPolicy":"utc_plus_one_calendar_day","completion":{"mode":"advertisement"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND config->>'systemKey' = 'view_ads'
);
