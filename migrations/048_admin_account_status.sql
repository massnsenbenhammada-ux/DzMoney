ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'banned'));

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
