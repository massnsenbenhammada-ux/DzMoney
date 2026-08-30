-- Canonical permanent Invite achievement rewards.
-- Qualified referral count and claim state remain on the existing Referral/Task boundaries.

WITH rewards(system_key, reward_coin, reward_dzx, reward_dzp) AS (
  VALUES
    ('invite_1_friend', 10000::numeric, 10::numeric, 1::numeric),
    ('invite_10_friends', 100000::numeric, 100::numeric, 10::numeric),
    ('invite_20_friends', 200000::numeric, 200::numeric, 20::numeric),
    ('invite_50_friends', 500000::numeric, 500::numeric, 50::numeric),
    ('invite_100_friends', 1000000::numeric, 1000::numeric, 100::numeric)
)
UPDATE activity_tasks AS task
SET reward_coin = rewards.reward_coin,
    reward_dzx = rewards.reward_dzx,
    reward_dzp = rewards.reward_dzp
FROM rewards
WHERE task.task_type = 'daily'
  AND task.status = 'active'
  AND task.config->>'systemKey' = rewards.system_key
  AND task.config->>'dailyPolicy' = 'permanent'
  AND task.config->>'achievementThreshold' IS NOT NULL;

DO $$
DECLARE
  expected_count integer := 5;
  actual_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO actual_count
  FROM activity_tasks
  WHERE task_type = 'daily'
    AND status = 'active'
    AND config->>'dailyPolicy' = 'permanent'
    AND config->>'systemKey' IN (
      'invite_1_friend',
      'invite_10_friends',
      'invite_20_friends',
      'invite_50_friends',
      'invite_100_friends'
    )
    AND reward_coin IS NOT NULL
    AND reward_dzx IS NOT NULL
    AND reward_dzp IS NOT NULL;

  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Expected % active permanent Invite achievement tasks, found %', expected_count, actual_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM activity_tasks AS task
    WHERE task.task_type = 'daily'
      AND task.status = 'active'
      AND task.config->>'dailyPolicy' = 'permanent'
      AND task.config->>'systemKey' = 'invite_1_friend'
      AND (task.reward_coin, task.reward_dzx, task.reward_dzp) <> (10000, 10, 1)
  ) OR EXISTS (
    SELECT 1
    FROM activity_tasks AS task
    WHERE task.task_type = 'daily'
      AND task.status = 'active'
      AND task.config->>'dailyPolicy' = 'permanent'
      AND task.config->>'systemKey' = 'invite_10_friends'
      AND (task.reward_coin, task.reward_dzx, task.reward_dzp) <> (100000, 100, 10)
  ) OR EXISTS (
    SELECT 1
    FROM activity_tasks AS task
    WHERE task.task_type = 'daily'
      AND task.status = 'active'
      AND task.config->>'dailyPolicy' = 'permanent'
      AND task.config->>'systemKey' = 'invite_20_friends'
      AND (task.reward_coin, task.reward_dzx, task.reward_dzp) <> (200000, 200, 20)
  ) OR EXISTS (
    SELECT 1
    FROM activity_tasks AS task
    WHERE task.task_type = 'daily'
      AND task.status = 'active'
      AND task.config->>'dailyPolicy' = 'permanent'
      AND task.config->>'systemKey' = 'invite_50_friends'
      AND (task.reward_coin, task.reward_dzx, task.reward_dzp) <> (500000, 500, 50)
  ) OR EXISTS (
    SELECT 1
    FROM activity_tasks AS task
    WHERE task.task_type = 'daily'
      AND task.status = 'active'
      AND task.config->>'dailyPolicy' = 'permanent'
      AND task.config->>'systemKey' = 'invite_100_friends'
      AND (task.reward_coin, task.reward_dzx, task.reward_dzp) <> (1000000, 1000, 100)
  ) THEN
    RAISE EXCEPTION 'Invite achievement reward contract mismatch';
  END IF;
END $$;
