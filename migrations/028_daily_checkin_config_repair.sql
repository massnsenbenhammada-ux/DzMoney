-- Repair pre-existing canonical Daily Check-in rows created before migration 027.
-- Migration 027 intentionally inserted only when no canonical row existed, so
-- an existing production row could retain the legacy config shape.

UPDATE activity_tasks
SET config = COALESCE(config, '{}'::jsonb) || '{"dailyMode":"advertisement"}'::jsonb
WHERE task_type = 'daily'
  AND status = 'active'
  AND config->>'systemKey' = 'daily_check_in'
  AND config->>'dailyMode' IS DISTINCT FROM 'advertisement';

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
