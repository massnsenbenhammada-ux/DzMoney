-- Creator Campaign task ownership and execution target.
-- Existing migrations remain immutable.

ALTER TABLE activity_tasks
  ADD COLUMN IF NOT EXISTS creator_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS target BIGINT;

ALTER TABLE activity_tasks
  DROP CONSTRAINT IF EXISTS activity_tasks_target_positive;

ALTER TABLE activity_tasks
  ADD CONSTRAINT activity_tasks_target_positive
  CHECK (target IS NULL OR target > 0);

CREATE INDEX IF NOT EXISTS idx_activity_tasks_creator_id
  ON activity_tasks(creator_id);
