-- Canonical Daily View Ads: 20 verified task advertisements per UTC+1 day.
-- Reward is issued exactly once at 20/20: 1,000 COIN + 1 DZX, no DZP.
-- Progress remains in the existing activity_ad_events source of truth.

UPDATE activity_tasks
SET config = config || jsonb_build_object('advertisementTarget', 20),
    reward_coin = 1000,
    reward_dzx = 1,
    reward_dzp = 0
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'view_ads';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM activity_tasks
    WHERE task_type = 'daily'
      AND status = 'active'
      AND config->>'systemKey' = 'view_ads'
      AND (config->>'advertisementTarget')::integer = 20
      AND reward_coin = 1000
      AND reward_dzx = 1
      AND reward_dzp = 0
  ) THEN
    RAISE EXCEPTION 'Daily View Ads target/reward configuration was not applied';
  END IF;
END $$;