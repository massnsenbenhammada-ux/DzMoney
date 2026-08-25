CREATE TABLE IF NOT EXISTS referral_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified')),
  qualification_source TEXT CHECK (qualification_source IN ('advertisement', 'task')),
  qualification_reference TEXT,
  qualified_at TIMESTAMPTZ,
  activation_transaction_id BIGINT REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_user_id),
  CHECK (referrer_user_id <> referred_user_id),
  CHECK (
    (status = 'pending' AND qualification_source IS NULL AND qualification_reference IS NULL AND qualified_at IS NULL)
    OR
    (status = 'qualified' AND qualification_source IS NOT NULL AND qualification_reference IS NOT NULL AND qualified_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer_status
  ON referral_attributions(referrer_user_id, status);

CREATE TABLE IF NOT EXISTS referral_lifetime_rewards (
  id BIGSERIAL PRIMARY KEY,
  referral_attribution_id BIGINT NOT NULL REFERENCES referral_attributions(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activity_reference TEXT NOT NULL,
  base_coin NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (base_coin >= 0),
  base_dzx NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (base_dzx >= 0),
  base_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (base_dzp >= 0),
  reward_coin NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_coin >= 0),
  reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzx >= 0),
  reward_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzp >= 0),
  transaction_id BIGINT REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referral_attribution_id, activity_reference)
);

CREATE TABLE IF NOT EXISTS referral_achievements (
  id BIGSERIAL PRIMARY KEY,
  milestone INTEGER NOT NULL UNIQUE CHECK (milestone > 0),
  title TEXT NOT NULL,
  reward_coin NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_coin >= 0),
  reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzx >= 0),
  reward_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzp >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reward_coin > 0 OR reward_dzx > 0 OR reward_dzp > 0)
);

CREATE TABLE IF NOT EXISTS referral_achievement_claims (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id BIGINT NOT NULL REFERENCES referral_achievements(id) ON DELETE RESTRICT,
  ad_event_id BIGINT NOT NULL REFERENCES activity_ad_events(id) ON DELETE RESTRICT,
  reward_transaction_id BIGINT REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, achievement_id),
  CHECK ((claimed_at IS NULL AND reward_transaction_id IS NULL) OR (claimed_at IS NOT NULL AND reward_transaction_id IS NOT NULL))
);

INSERT INTO referral_achievements (milestone, title, reward_coin, reward_dzx, reward_dzp)
VALUES
  (1, 'Invite 1 Friend', 1000, 1, 1),
  (10, 'Invite 10 Friends', 1000, 1, 1),
  (20, 'Invite 20 Friends', 1000, 1, 1),
  (50, 'Invite 50 Friends', 1000, 1, 1),
  (100, 'Invite 100 Friends', 1000, 1, 1)
ON CONFLICT (milestone) DO NOTHING;

INSERT INTO admin_settings(key, value) VALUES
  ('referral.reward_coin', '10000'::jsonb),
  ('referral.reward_dzx', '10'::jsonb),
  ('referral.reward_dzp', '10'::jsonb),
  ('referral.lifetime_percent', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;
