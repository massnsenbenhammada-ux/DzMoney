CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('COIN', 'DZX', 'DZP')),
  balance NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  earned_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (earned_dzp >= 0),
  converted_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (converted_dzp >= 0),
  purchased_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (purchased_dzp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_account_id BIGINT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency IN ('COIN', 'DZX', 'DZP')),
  amount NUMERIC(30,9) NOT NULL,
  balance_before NUMERIC(30,9) NOT NULL,
  balance_after NUMERIC(30,9) NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT,
  old_value JSONB,
  new_value JSONB,
  actor_telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT PRIMARY KEY,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_settings(key, value) VALUES
  ('economy.coin_per_dzx', '1000'::jsonb),
  ('economy.dzx_per_ton', '10000'::jsonb),
  ('economy.coin_per_ton', '10000000'::jsonb),
  ('economy.coin_per_dzp', '1000'::jsonb),
  ('economy.dzx_per_dzp', '10'::jsonb),
  ('activity.reward_coin', '1000'::jsonb),
  ('activity.reward_dzx', '1'::jsonb),
  ('activity.reward_dzp', '1'::jsonb),
  ('referral.reward_coin', '10000'::jsonb),
  ('referral.reward_dzx', '10'::jsonb),
  ('referral.reward_dzp', '10'::jsonb),
  ('referral.lifetime_percent', '20'::jsonb),
  ('reward_pool.daily_dzx', '0'::jsonb),
  ('reward_pool.activation_ads', '10'::jsonb),
  ('withdrawal.min_ton', '0.2'::jsonb),
  ('withdrawal.min_coin', '2000000'::jsonb),
  ('withdrawal.min_dzx', '2000'::jsonb)
ON CONFLICT (key) DO NOTHING;
