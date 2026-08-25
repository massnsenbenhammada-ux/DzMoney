-- Creator campaign reference price.
-- Admin may change this setting; historical campaign ledger snapshots remain immutable.

INSERT INTO admin_settings(key, value)
VALUES ('task.campaign_price_dzx_per_execution', '9'::jsonb)
ON CONFLICT (key) DO NOTHING;
