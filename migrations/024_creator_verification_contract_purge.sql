-- Phase 2 Creator contract migration.
-- Historical migrations remain immutable; persisted Creator configs are converted
-- before the legacy completion model is rejected by runtime validation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM activity_tasks
    WHERE task_type IN ('game', 'social', 'web')
      AND config ? 'completion'
      AND COALESCE(config->'completion'->>'mode', '') = 'server_verified'
      AND COALESCE(config->'verification'->>'method', '') NOT IN ('url_format_match', 'telegram_bot_api')
  ) THEN
    RAISE EXCEPTION 'Ambiguous Creator completion configuration found; manual migration is required';
  END IF;
END $$;

UPDATE activity_tasks
SET config = (config - 'completion')
  || jsonb_build_object('campaignUrl', config->'completion'->>'url')
  || jsonb_build_object('verification', COALESCE(config->'verification', '{}'::jsonb) || jsonb_build_object('method', 'click_proof'))
WHERE task_type IN ('game', 'social', 'web')
  AND config->'completion'->>'mode' = 'open_link'
  AND config->'completion'->>'url' IS NOT NULL;

UPDATE activity_tasks
SET config = (config - 'completion')
  || jsonb_build_object('campaignUrl', config->'completion'->>'url')
WHERE task_type IN ('game', 'social', 'web')
  AND config->'completion'->>'mode' = 'server_verified'
  AND config->'verification'->>'method' = 'url_format_match'
  AND config->'completion'->>'url' IS NOT NULL;

UPDATE activity_tasks
SET config = (config - 'completion')
  || jsonb_build_object('campaignUrl', config->'completion'->>'url')
  || jsonb_build_object('verification', jsonb_set(COALESCE(config->'verification', '{}'::jsonb), '{method}', '"bot_api"'::jsonb, true))
WHERE task_type = 'social'
  AND config->'completion'->>'mode' = 'server_verified'
  AND config->'verification'->>'method' = 'telegram_bot_api'
  AND config->'completion'->>'url' IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM activity_tasks
    WHERE task_type IN ('game', 'social', 'web')
      AND config ? 'completion'
  ) THEN
    RAISE EXCEPTION 'Creator completion state remains after Phase 2 migration';
  END IF;
END $$;