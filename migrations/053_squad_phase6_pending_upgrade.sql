-- Phase 6: persist deferred Squad Upgrade requests with their exact source membership context.
ALTER TABLE squad_membership_purchase_requests
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS current_membership_id BIGINT REFERENCES squad_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_squad_id BIGINT REFERENCES squads(id) ON DELETE SET NULL;

ALTER TABLE squad_membership_purchase_requests
  DROP CONSTRAINT IF EXISTS squad_membership_purchase_requests_status_check;

ALTER TABLE squad_membership_purchase_requests
  ADD CONSTRAINT squad_membership_purchase_requests_status_check
  CHECK (status IN ('pending', 'settled', 'invalidated'));

ALTER TABLE squad_membership_purchase_requests
  DROP CONSTRAINT IF EXISTS squad_membership_purchase_requests_operation_type_check;

ALTER TABLE squad_membership_purchase_requests
  ADD CONSTRAINT squad_membership_purchase_requests_operation_type_check
  CHECK (operation_type IN ('purchase', 'upgrade'));

ALTER TABLE squad_membership_purchase_requests
  DROP CONSTRAINT IF EXISTS squad_membership_purchase_requests_source_context_check;

ALTER TABLE squad_membership_purchase_requests
  ADD CONSTRAINT squad_membership_purchase_requests_source_context_check
  CHECK (
    (operation_type = 'purchase' AND current_membership_id IS NULL AND current_squad_id IS NULL)
    OR
    (operation_type = 'upgrade' AND current_membership_id IS NOT NULL AND current_squad_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS squad_membership_purchase_requests_upgrade_source_key
  ON squad_membership_purchase_requests (current_membership_id, current_squad_id)
  WHERE operation_type = 'upgrade' AND status = 'pending';
