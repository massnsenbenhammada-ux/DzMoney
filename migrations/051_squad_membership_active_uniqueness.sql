-- Phase 14: allow cancelled membership history while keeping one live membership per user.
ALTER TABLE squad_memberships
  DROP CONSTRAINT IF EXISTS squad_memberships_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS squad_memberships_user_id_active_key
  ON squad_memberships (user_id)
  WHERE status <> 'cancelled';
