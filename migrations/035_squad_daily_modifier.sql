ALTER TABLE squad_daily_states
  ADD COLUMN IF NOT EXISTS modifier_rate NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (modifier_rate >= 0 AND modifier_rate <= 1);

CREATE TABLE IF NOT EXISTS squad_daily_contributors (
  id BIGSERIAL PRIMARY KEY,
  squad_daily_state_id BIGINT NOT NULL REFERENCES squad_daily_states(id) ON DELETE CASCADE,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contribution NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (contribution >= 0),
  activation_contributor BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (squad_daily_state_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_daily_contributors_lookup
  ON squad_daily_contributors (squad_id, user_id, squad_daily_state_id);
