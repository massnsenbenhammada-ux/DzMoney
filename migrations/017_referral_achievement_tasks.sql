-- Permanent Referral achievement tasks. Claim state remains in task_attempts.
-- Qualified referral count remains canonical in referral_attributions.

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
  v.title,
  v.description,
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_coin'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzx'),
  (SELECT (value #>> '{}')::numeric FROM admin_settings WHERE key = 'activity.default_reward_dzp'),
  (SELECT (value #>> '{}')::integer FROM admin_settings WHERE key = 'activity.verification_ad_seconds'),
  'active',
  jsonb_build_object(
    'systemKey', v.system_key,
    'achievementThreshold', v.threshold,
    'dailyPolicy', 'permanent',
    'completion', jsonb_build_object('mode', 'server_verified')
  )
FROM (VALUES
  ('invite_1_friend', 'Invite 1 Friend', 'Invite one qualified friend and claim the achievement after the required advertisement.', 1),
  ('invite_10_friends', 'Invite 10 Friends', 'Invite ten qualified friends and claim the achievement after the required advertisement.', 10),
  ('invite_20_friends', 'Invite 20 Friends', 'Invite twenty qualified friends and claim the achievement after the required advertisement.', 20),
  ('invite_50_friends', 'Invite 50 Friends', 'Invite fifty qualified friends and claim the achievement after the required advertisement.', 50),
  ('invite_100_friends', 'Invite 100 Friends', 'Invite one hundred qualified friends and claim the achievement after the required advertisement.', 100)
) AS v(system_key, title, description, threshold)
WHERE NOT EXISTS (
  SELECT 1 FROM activity_tasks t
  WHERE t.task_type = 'daily'
    AND t.config->>'systemKey' = v.system_key
);
