-- Phase 4 foundation: hierarchical Squad membership, qualifying activity, daily eligibility and generic goals.
-- Squad is a modifier for base activity rewards; this schema does not mint an independent Squad reward.

CREATE TABLE IF NOT EXISTS squads (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS squad_memberships (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  parent_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ,
  active_since TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_user_id IS NULL OR parent_user_id <> user_id)
);
CREATE INDEX IF NOT EXISTS idx_squad_memberships_squad_parent ON squad_memberships(squad_id, parent_user_id);
CREATE INDEX IF NOT EXISTS idx_squad_memberships_squad_status ON squad_memberships(squad_id, status);
CREATE INDEX IF NOT EXISTS idx_squad_memberships_activity ON squad_memberships(squad_id, last_activity_at);

CREATE TABLE IF NOT EXISTS squad_activity_events (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_id TEXT,
  quantity NUMERIC(30,9) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_squad_activity_squad_time ON squad_activity_events(squad_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_squad_activity_user_time ON squad_activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_squad_activity_type ON squad_activity_events(squad_id, activity_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS squad_goals (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  target_type TEXT NOT NULL,
  target_quantity NUMERIC(30,9) NOT NULL CHECK (target_quantity > 0),
  reward_currency TEXT NOT NULL CHECK (reward_currency IN ('DZX')),
  reward_pool NUMERIC(30,9) NOT NULL CHECK (reward_pool > 0),
  weight_rule TEXT NOT NULL DEFAULT 'contribution' CHECK (weight_rule IN ('contribution')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','expired','cancelled','rewarded')),
  completed_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_squad_goals_squad_status ON squad_goals(squad_id, status);

CREATE TABLE IF NOT EXISTS squad_goal_contributions (
  id BIGSERIAL PRIMARY KEY,
  goal_id BIGINT NOT NULL REFERENCES squad_goals(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_event_id BIGINT NOT NULL UNIQUE REFERENCES squad_activity_events(id) ON DELETE RESTRICT,
  contribution_quantity NUMERIC(30,9) NOT NULL CHECK (contribution_quantity > 0),
  weight NUMERIC(30,9) NOT NULL CHECK (weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(goal_id, activity_event_id)
);
CREATE INDEX IF NOT EXISTS idx_squad_goal_contributions_goal ON squad_goal_contributions(goal_id, user_id);

CREATE TABLE IF NOT EXISTS squad_goal_distributions (
  id BIGSERIAL PRIMARY KEY,
  goal_id BIGINT NOT NULL REFERENCES squad_goals(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight NUMERIC(30,9) NOT NULL CHECK (weight > 0),
  total_weight NUMERIC(30,9) NOT NULL CHECK (total_weight > 0),
  reward_amount NUMERIC(30,9) NOT NULL CHECK (reward_amount > 0),
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(goal_id, user_id)
);

INSERT INTO admin_settings(key, value) VALUES
  ('squad.inactivity_days', '7'::jsonb),
  ('squad.daily_bonus_rate', '0'::jsonb),
  ('squad.daily_activity_threshold_percent', '80'::jsonb),
  ('squad.daily_activity_window_days', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;
