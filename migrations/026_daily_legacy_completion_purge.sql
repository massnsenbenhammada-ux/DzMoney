-- Remove the last legacy completion records from historical daily system tasks.
-- Historical migrations remain immutable; this migration converts their persisted state
-- to the canonical verification representation without introducing a second verifier.

UPDATE activity_tasks
SET config = (config - 'completion')
  || jsonb_build_object(
    'verification',
    COALESCE(config->'verification', '{}'::jsonb)
      || jsonb_build_object(
        'method', 'bot_api',
        'provider', 'telegram_channel',
        'event', 'channel_membership',
        'providerConfigRef', 'telegram.dzmoney_updates'
      )
  )
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'check_for_update'
  AND config ? 'completion';

UPDATE activity_tasks
SET config = config - 'completion'
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'view_ads'
  AND config ? 'completion';

UPDATE activity_tasks
SET config = config - 'completion'
WHERE task_type = 'daily'
  AND config->>'achievementThreshold' IS NOT NULL
  AND config ? 'completion';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM activity_tasks
    WHERE config ? 'completion'
  ) THEN
    RAISE EXCEPTION 'Legacy completion configuration remains in activity_tasks';
  END IF;
END $$;