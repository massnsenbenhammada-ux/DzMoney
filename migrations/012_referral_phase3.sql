CREATE TABLE IF NOT EXISTS referral_attributions (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified')),
  qualification_source TEXT CHECK (qualification_source IN ('advertisement', 'task')),
  qualification_reference TEXT,
  qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_user_id),
  CHECK (referrer_user_id <> referred_user_id),
  CHECK ((status = 'pending' AND qualification_source IS NULL AND qualification_reference IS NULL AND qualified_at IS NULL)
      OR (status = 'qualified' AND qualification_source IS NOT NULL AND qualification_reference IS NOT NULL AND qualified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer_status ON referral_attributions(referrer_user_id, status);
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referral_attribution_id, activity_reference)
);
