-- Phase 5 Gaming Tasks.
-- Uses the existing Task Catalog -> Execution -> Verification -> Reward pipeline.
-- Each task grants exactly one Gaming resource after server verification.

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
  'game',
  'Spin — Watch Ad',
  'Watch the verification advertisement to claim +1 Spin.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"gamingResource":"spin","completion":{"mode":"server_verified"},"verification":{"mode":"advertisement"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM activity_tasks
  WHERE task_type = 'game' AND config->>'gamingResource' = 'spin'
);

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
  'game',
  'Digging — Watch Ad',
  'Watch the verification advertisement to claim +1 Axe.',
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  '{"gamingResource":"axe","completion":{"mode":"server_verified"},"verification":{"mode":"advertisement"}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM activity_tasks
  WHERE task_type = 'game' AND config->>'gamingResource' = 'axe'
);
