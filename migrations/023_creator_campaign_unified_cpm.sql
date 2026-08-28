-- Creator Campaign unified pricing.
-- User Creator campaigns use one canonical CPM regardless of verification method.
-- Ensure the live Admin setting exists at the locked 10 DZX per execution price.

INSERT INTO admin_settings(key, value)
VALUES ('task.campaign_price_dzx_per_execution', '10'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
