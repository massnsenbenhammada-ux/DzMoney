-- Keep Squad Ads on the canonical advertisement task contract.
-- Verification is handled by the Advertisement Engine, not legacy task completion config.
UPDATE activity_tasks
SET config = config - 'completion',
    updated_at = NOW()
WHERE config->>'systemKey' = 'squad_ads'
  AND config ? 'completion';
