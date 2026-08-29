-- Canonicalize Daily Check-in as a Daily System Task.
-- Existing daily_checkins state remains readable for backward compatibility.
-- Check-in rewards remain sourced from the existing admin settings at migration time.

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
  'Daily Check-in',
  'Watch the required advertisement to claim your Daily Check-in reward.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.daily_checkin_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.daily_checkin_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.daily_checkin_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"systemKey":"daily_check_in","dailyPolicy":"rolling_24h","dailyMode":"advertisement"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND config->>'systemKey' = 'daily_check_in'
);

DO $$
DECLARE
  task_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND config->>'systemKey' = 'daily_check_in'
    AND status = 'active';
  IF task_count <> 1 THEN
    RAISE EXCEPTION 'Canonical Daily Check-in task count must be exactly 1';
  END IF;
END $$;
