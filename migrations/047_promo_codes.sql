CREATE TABLE IF NOT EXISTS promo_campaigns (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  reward_currency TEXT NOT NULL CHECK (reward_currency IN ('COIN', 'DZX')),
  reward_amount NUMERIC(30,9) NOT NULL CHECK (reward_amount > 0),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  ad_gated BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  ad_event_id BIGINT UNIQUE REFERENCES activity_ad_events(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  reward_currency TEXT NOT NULL CHECK (reward_currency IN ('COIN', 'DZX')),
  reward_amount NUMERIC(30,9) NOT NULL CHECK (reward_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS promo_campaigns_enabled_idx ON promo_campaigns(enabled, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS promo_redemptions_campaign_status_idx ON promo_redemptions(campaign_id, status);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_campaign_idx ON promo_redemptions(user_id, campaign_id, status);
CREATE INDEX IF NOT EXISTS promo_redemptions_ad_event_idx ON promo_redemptions(ad_event_id);
