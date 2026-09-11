DO $$
BEGIN
  ALTER TABLE gaming_sessions
    DROP CONSTRAINT IF EXISTS gaming_sessions_status_check;
  ALTER TABLE gaming_sessions
    ADD CONSTRAINT gaming_sessions_status_check CHECK (status IN ('active','completed','expired'));
END $$;
