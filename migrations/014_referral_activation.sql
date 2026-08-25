ALTER TABLE referral_attributions
  ADD COLUMN activation_at TIMESTAMPTZ,
  ADD COLUMN activation_idempotency_key TEXT UNIQUE;

ALTER TABLE referral_attributions
  ADD CONSTRAINT referral_attributions_activation_state_check
  CHECK (
    (status = 'pending' AND activation_at IS NULL AND activation_idempotency_key IS NULL)
    OR
    (status = 'qualified' AND (
      (activation_at IS NULL AND activation_idempotency_key IS NULL)
      OR
      (activation_at IS NOT NULL AND activation_idempotency_key IS NOT NULL)
    ))
  );

CREATE INDEX idx_referral_attributions_activation
  ON referral_attributions(status, activation_at);
