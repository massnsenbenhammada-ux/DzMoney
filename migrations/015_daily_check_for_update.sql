-- Daily system task: Check for Update.
-- Uses the existing activity_tasks/task_attempts/verification/economy pipeline.
-- UTC+1 calendar-day eligibility is encoded in task config; no second state store is created.

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
  'Check for Update',
  'Check the official DzMoney updates channel for the latest update.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"systemKey":"check_for_update","dailyPolicy":"utc_plus_one_calendar_day","completion":{"mode":"server_verified"},"verification":{"mode":"automatic","provider":"telegram_channel","providerConfigRef":"telegram.dzmoney_updates"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND config->>'systemKey' = 'check_for_update'
);
