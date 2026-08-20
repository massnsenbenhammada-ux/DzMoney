-- DzMoney 2.0 core schema
-- PostgreSQL
-- This migration intentionally contains only foundation tables.
-- Feature-specific tables belong to later migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('COIN', 'DZX', 'DZP', 'TON')),
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  earned_balance BIGINT NOT NULL DEFAULT 0 CHECK (earned_balance >= 0),
  purchased_balance BIGINT NOT NULL DEFAULT 0 CHECK (purchased_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  reference_type TEXT,
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'reversed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_type, actor_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency IN ('COIN', 'DZX', 'DZP', 'TON')),
  amount BIGINT NOT NULL CHECK (amount <> 0),
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  source_class TEXT CHECK (source_class IN ('EARNED', 'PURCHASED', 'SYSTEM', 'DEPOSIT', 'WITHDRAWAL', 'RESERVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created
  ON ledger_entries(wallet_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_reference
  ON ledger_transactions(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  operation_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_type, user_id, idempotency_key)
);

-- Prevent modification/deletion of posted ledger history.
CREATE OR REPLACE FUNCTION prevent_posted_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'posted ledger transactions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_transaction_immutable ON ledger_transactions;
CREATE TRIGGER trg_ledger_transaction_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_mutation();

CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_entry_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_entry_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();

-- Default economic settings. These are seed values, not hard-coded application behavior.
INSERT INTO admin_settings(key, value, description, is_public)
VALUES
  ('economy.ton_to_dzx', '10000'::jsonb, 'Default DZX units per TON', true),
  ('economy.ton_to_coin', '1000000'::jsonb, 'Default COIN units per TON', true),
  ('economy.coin_to_dzp', '1000'::jsonb, 'Default COIN units per DZP', true),
  ('economy.task_reward_coin', '1000'::jsonb, 'Default task/ad COIN reward', true),
  ('economy.task_reward_dzx', '1'::jsonb, 'Default task/ad DZX reward', true),
  ('economy.task_reward_dzp', '1'::jsonb, 'Default task/ad DZP reward', true),
  ('referral.one_time_coin', '10000'::jsonb, 'One-time qualified referral COIN reward', true),
  ('referral.one_time_dzx', '10'::jsonb, 'One-time qualified referral DZX reward', true),
  ('referral.one_time_dzp', '10'::jsonb, 'One-time qualified referral DZP reward', true),
  ('referral.lifetime_percent', '20'::jsonb, 'Lifetime direct referral activity commission percent', true),
  ('reward_pool.daily_ton', '0'::jsonb, 'Admin-configured daily TON distribution amount', false),
  ('reward_pool.activation_ads', '10'::jsonb, 'Reward Pool qualifying ads required for activation', true),
  ('squad.activity_percent', '50'::jsonb, 'Minimum active Squad member percentage', true),
  ('withdrawal.minimum_ton_nano', '200000000'::jsonb, 'Default minimum withdrawal: 0.2 TON in nanoTON', true),
  ('withdrawal.required_coin', '2000000'::jsonb, 'Default COIN withdrawal requirement', true),
  ('withdrawal.required_dzx', '2000'::jsonb, 'Default DZX withdrawal requirement', true),
  ('user_task.cost_per_1000_visits_ton_nano', '900000000'::jsonb, 'Reference cost: 0.90 TON per 1000 visits', true),
  ('user_task.cost_per_1000_visits_dzx', '9000'::jsonb, 'Reference cost: 9000 DZX per 1000 visits', true)
ON CONFLICT (key) DO NOTHING;
