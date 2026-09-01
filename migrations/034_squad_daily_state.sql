-- Phase 4: daily Squad state snapshot. The snapshot freezes the day's eligible-member count.
CREATE TABLE IF NOT EXISTS squad_daily_states (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  eligible_member_count INTEGER NOT NULL CHECK (eligible_member_count >= 0),
  daily_target NUMERIC(30,9) NOT NULL CHECK (daily_target >= 0),
  active_member_count INTEGER NOT NULL DEFAULT 0 CHECK (active_member_count >= 0),
  dzp_contribution NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (dzp_contribution >= 0),
  status TEXT NOT NULL DEFAULT 'risk' CHECK (status IN ('active', 'risk')),
  activation_reason TEXT CHECK (activation_reason IN ('target', 'activity', 'both')),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (squad_id, day_date)
);

CREATE INDEX IF NOT EXISTS idx_squad_daily_states_day
  ON squad_daily_states (day_date, squad_id);

INSERT INTO admin_settings (key, value)
VALUES
  ('squad.daily_target_dzp_per_member', '10'),
  ('squad.daily_verified_ad_target', '10')
ON CONFLICT (key) DO NOTHING;
