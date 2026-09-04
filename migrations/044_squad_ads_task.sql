-- Canonical Squad Ads task: the same task/advertisement engine as View Ads,
-- rendered only from the Squad page. Reactivation remains a separate concern.
INSERT INTO activity_tasks (
  task_type, title, description, reward_coin, reward_dzx, reward_dzp,
  verification_ad_seconds, status, config
)
SELECT
  'daily',
  'Squad Ads',
  'Watch verified advertisements to complete the Squad Ads target.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"systemKey":"squad_ads","advertisementTarget":10,"advertisementContext":"squad","placement":"squad","dailyMode":"advertisement","completion":{"mode":"server_verified"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM activity_tasks WHERE config->>'systemKey' = 'squad_ads'
);
