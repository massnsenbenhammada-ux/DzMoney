BEGIN;

-- ============================================================
-- DzMoney Phase 1: Core financial foundation
--
-- Design goals:
--   1. Ledger is the immutable financial history.
--   2. wallet_balances is the fast current-balance projection.
--   3. Every financial mutation has an idempotency key.
--   4. Coins and BUX are separate currencies.
--   5. Task claims support one-time and repeatable tasks.
--
-- IMPORTANT:
-- This migration only creates the database foundation. Existing
-- application code is NOT switched to use it by this migration.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Current wallet balances
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('COINS', 'BUX')),
  available_amount NUMERIC(30, 6) NOT NULL DEFAULT 0 CHECK (available_amount >= 0),
  locked_amount NUMERIC(30, 6) NOT NULL DEFAULT 0 CHECK (locked_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_wallet_balances_user
  ON wallet_balances(user_id);

-- ------------------------------------------------------------
-- Immutable financial ledger
-- amount is signed: positive = credit, negative = debit.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency IN ('COINS', 'BUX')),
  amount NUMERIC(30, 6) NOT NULL CHECK (amount <> 0),
  balance_before NUMERIC(30, 6) NOT NULL CHECK (balance_before >= 0),
  balance_after NUMERIC(30, 6) NOT NULL CHECK (balance_after >= 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'INITIAL_BALANCE',
    'DAILY_REWARD',
    'TASK_REWARD',
    'AD_REWARD',
    'REFERRAL_REWARD',
    'SQUAD_REWARD',
    'ADMIN_CREDIT',
    'ADMIN_DEBIT',
    'WITHDRAWAL_LOCK',
    'WITHDRAWAL_RELEASE',
    'WITHDRAWAL_DEBIT',
    'REVERSAL',
    'SYSTEM_ADJUSTMENT'
  )),
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created
  ON ledger_entries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_reference
  ON ledger_entries(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_ledger_user_currency_created
  ON ledger_entries(user_id, currency, created_at DESC);

-- ------------------------------------------------------------
-- Prevent duplicate business operations even if a caller uses
-- different request IDs. A reference can be unique when supplied.
-- The partial index intentionally permits NULL reference IDs.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_reference_operation
  ON ledger_entries(user_id, currency, entry_type, reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
    AND entry_type IN (
      'DAILY_REWARD',
      'TASK_REWARD',
      'AD_REWARD',
      'REFERRAL_REWARD',
      'SQUAD_REWARD',
      'WITHDRAWAL_LOCK',
      'WITHDRAWAL_RELEASE',
      'WITHDRAWAL_DEBIT'
    );

-- ------------------------------------------------------------
-- Task claim history
-- Existing projects may have a legacy one-row-per-user/task table.
-- The new foundation adds a stable claim id and operation fields.
-- ------------------------------------------------------------
ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE task_claims
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE task_claims
  ALTER COLUMN id SET NOT NULL;

-- Drop the legacy composite primary key if it exists. The exact
-- constraint name is normally task_claims_pkey for the existing schema.
DO $$
DECLARE
  pk_name TEXT;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'task_claims'::regclass
    AND contype = 'p';

  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE task_claims DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

ALTER TABLE task_claims
  ADD CONSTRAINT task_claims_pkey PRIMARY KEY (id);

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('STARTED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS reward_coins NUMERIC(30, 6) NOT NULL DEFAULT 0
    CHECK (reward_coins >= 0);

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS reward_bux NUMERIC(30, 6) NOT NULL DEFAULT 0
    CHECK (reward_bux >= 0);

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE task_claims
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_claim_idempotency
  ON task_claims(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_claims_user_task_created
  ON task_claims(user_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_claims_user_status
  ON task_claims(user_id, status, created_at DESC);

-- ------------------------------------------------------------
-- Generic idempotency records for non-ledger operations.
-- This prevents repeated HTTP requests from creating duplicate
-- business actions such as a task start or daily claim.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  response_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, operation, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created
  ON idempotency_keys(created_at);

-- ------------------------------------------------------------
-- Keep updated_at synchronized for wallet balances.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION dzmoney_touch_wallet_balance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_balances_updated_at ON wallet_balances;
CREATE TRIGGER trg_wallet_balances_updated_at
BEFORE UPDATE ON wallet_balances
FOR EACH ROW
EXECUTE FUNCTION dzmoney_touch_wallet_balance_updated_at();

COMMIT;
