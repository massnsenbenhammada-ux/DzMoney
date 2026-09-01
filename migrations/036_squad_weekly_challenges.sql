CREATE TABLE IF NOT EXISTS squad_weekly_challenges (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ALL TASKS','Type Tasks','Verified Ad','Verified Task','Verified Squad AdView','All Activity Verified')),
  scope_value TEXT,
  reward_currency TEXT NOT NULL CHECK (reward_currency IN ('COIN','DZX','DZP')),
  reward_amount NUMERIC(30,9) NOT NULL CHECK (reward_amount > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','settled')),
  config_snapshot JSONB NOT NULL,
  created_by_admin_telegram_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  CHECK (scope_type <> 'Type Tasks' OR scope_value IN ('daily','game','social','web','special')),
  CHECK (scope_type = 'Type Tasks' OR scope_value IS NULL),
  CHECK (ends_at = starts_at + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_squad_weekly_challenges_squad_start
  ON squad_weekly_challenges (squad_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS squad_weekly_challenge_contributions (
  id BIGSERIAL PRIMARY KEY,
  challenge_id BIGINT NOT NULL REFERENCES squad_weekly_challenges(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dzp_contribution NUMERIC(30,9) NOT NULL CHECK (dzp_contribution >= 0),
  reward_amount NUMERIC(30,9),
  reward_transaction_id BIGINT REFERENCES ledger_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_weekly_challenge_contributions_user
  ON squad_weekly_challenge_contributions (challenge_id, user_id);
