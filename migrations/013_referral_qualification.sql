ALTER TABLE referral_attributions
  DROP CONSTRAINT referral_attributions_status_check;

ALTER TABLE referral_attributions
  ADD CONSTRAINT referral_attributions_status_check
  CHECK (status IN ('pending', 'qualified'));

ALTER TABLE referral_attributions
  ADD COLUMN qualified_at TIMESTAMPTZ,
  ADD COLUMN qualification_source TEXT,
  ADD COLUMN qualification_reference_id BIGINT,
  ADD COLUMN qualification_idempotency_key TEXT UNIQUE;

ALTER TABLE referral_attributions
  ADD CONSTRAINT referral_attributions_qualification_source_check
  CHECK (qualification_source IS NULL OR qualification_source IN ('task', 'advertisement'));

ALTER TABLE referral_attributions
  ADD CONSTRAINT referral_attributions_qualification_state_check
  CHECK (
    (status = 'pending' AND qualified_at IS NULL AND qualification_source IS NULL AND qualification_reference_id IS NULL)
    OR
    (status = 'qualified' AND qualified_at IS NOT NULL AND qualification_source IS NOT NULL AND qualification_reference_id IS NOT NULL)
  );

CREATE INDEX idx_referral_attributions_qualification_source
  ON referral_attributions(qualification_source, qualification_reference_id);
