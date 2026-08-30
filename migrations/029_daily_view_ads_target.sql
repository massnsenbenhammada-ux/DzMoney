-- Canonical Daily View Ads target: 20 verified task advertisements per UTC+1 day.
-- This extends the existing View Ads task configuration; it does not create a second state store.

UPDATE activity_tasks
SET config = config || jsonb_build_object('advertisementTarget', 20)
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'view_ads';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM activity_tasks
    WHERE task_type = 'daily'
      AND config->>'systemKey' = 'view_ads'
      AND (config->>'advertisementTarget')::integer = 20
  ) THEN
    RAISE EXCEPTION 'Daily View Ads target configuration was not applied';
  END IF;
END $$;