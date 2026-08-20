-- DzMoney 2.0 — finalized Phase 1 economy rates.
-- Corrects the initial DZP conversion rate to the locked specification.
-- 1 DZP = 10 DZX = 10,000 COIN.

UPDATE admin_settings
SET value = '10000'::jsonb,
    updated_at = NOW()
WHERE key = 'economy.coin_per_dzp';

UPDATE admin_settings
SET value = '10'::jsonb,
    updated_at = NOW()
WHERE key = 'economy.dzx_per_dzp';

INSERT INTO admin_settings(key, value)
VALUES ('economy.coin_per_dzp', '10000'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

INSERT INTO admin_settings(key, value)
VALUES ('economy.dzx_per_dzp', '10'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
