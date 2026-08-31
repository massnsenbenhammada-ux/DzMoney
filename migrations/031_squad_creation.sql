-- Phase 4 Squad creation foundation.
-- A Squad is system-created from users who do not have a Squad membership.
CREATE TABLE IF NOT EXISTS squads (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_user_id)
);

CREATE TABLE IF NOT EXISTS squad_memberships (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_memberships_squad_status
  ON squad_memberships (squad_id, status);

CREATE INDEX IF NOT EXISTS idx_squad_memberships_unassigned
  ON squad_memberships (user_id);
