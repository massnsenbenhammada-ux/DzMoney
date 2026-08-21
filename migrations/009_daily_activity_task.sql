-- Bridge the real Daily Check-in into the Phase 2 activity task catalog.
-- The existing daily_checkins service remains the source of truth for cooldown,
-- advertisement verification and reward claiming; this row only makes the task
-- discoverable through the unified Tasks API.
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_tasks_type_title
  ON activity_tasks(task_type, title);

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
) VALUES (
  'daily',
  'Daily Check-in',
  'Complete the verified daily advertisement to unlock today''s reward.',
  1000,
  1,
  1,
  5,
  'active',
  '{"handler":"daily_checkin","category":"daily_activity"}'::jsonb
)
ON CONFLICT (task_type, title) DO UPDATE SET
  description = EXCLUDED.description,
  verification_ad_seconds = EXCLUDED.verification_ad_seconds,
  status = 'active',
  config = EXCLUDED.config,
  updated_at = NOW();
