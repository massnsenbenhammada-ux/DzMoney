-- Daily Share with Friends already has an accepted Click Proof architecture (PR #130 / ADR-0011).
-- Convert the historical completion-shaped seed without introducing a second verifier or data source.

UPDATE activity_tasks
SET config = (config - 'completion')
  || jsonb_build_object('verification', COALESCE(config->'verification', '{}'::jsonb) || jsonb_build_object('method', 'click_proof'))
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'share_with_friends'
  AND config ? 'completion';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM activity_tasks
    WHERE task_type = 'daily'
      AND config->>'systemKey' = 'share_with_friends'
      AND config ? 'completion'
  ) THEN
    RAISE EXCEPTION 'Share with Friends completion state remains after Click Proof migration';
  END IF;
END $$;