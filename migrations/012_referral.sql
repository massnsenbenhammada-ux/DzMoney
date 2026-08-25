CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified')),
  qualification_activity_id TEXT,
  qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_user_id),
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx
  ON referrals (referrer_user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_qualified_activity_idx
  ON referrals (qualification_activity_id)
  WHERE qualification_activity_id IS NOT NULL;

INSERT INTO admin_settings(key, value) VALUES
  ('referral.reward_coin', '10000'::jsonb),
  ('referral.reward_dzx', '10'::jsonb),
  ('referral.reward_dzp', '10'::jsonb),
  ('referral.lifetime_percent', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;
