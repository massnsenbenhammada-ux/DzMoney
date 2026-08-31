-- Phase 4: free Squad invitation membership.
ALTER TABLE squad_memberships
  DROP CONSTRAINT IF EXISTS squad_memberships_status_check;

ALTER TABLE squad_memberships
  ADD CONSTRAINT squad_memberships_status_check
  CHECK (status IN ('inactive', 'active', 'suspended', 'cancelled'));

CREATE TABLE IF NOT EXISTS squad_invitations (
  id BIGSERIAL PRIMARY KEY,
  squad_id BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invitee_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CHECK (inviter_user_id <> invitee_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_squad_pending_invitation
  ON squad_invitations (squad_id, invitee_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_squad_invitations_invitee_status
  ON squad_invitations (invitee_user_id, status);
