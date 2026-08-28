-- Creator Campaign unified pricing.
-- User Creator campaigns use one canonical CPM regardless of verification method.
-- Replace the obsolete 9 DZX per-execution reference with 10 DZX.

UPDATE admin_settings
SET value = '10'::jsonb,
    updated_at = NOW()
WHERE key = 'task.campaign_price_dzx_per_execution';
