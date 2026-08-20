-- DzMoney Phase 1: final internal economy.
-- TON is an external reference/settlement currency, never an internal wallet.

DELETE FROM wallet_accounts WHERE currency = 'TON';

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_currency_check;

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_currency_check
  CHECK (currency IN ('COIN', 'DZX', 'DZP'));

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS converted_dzp NUMERIC(30,9) NOT NULL DEFAULT 0
    CHECK (converted_dzp >= 0);

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE ledger_entries le
SET currency = wa.currency
FROM wallet_accounts wa
WHERE wa.id = le.wallet_account_id
  AND le.currency IS NULL;

ALTER TABLE ledger_entries
  ALTER COLUMN currency SET NOT NULL;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_currency_check
  CHECK (currency IN ('COIN', 'DZX', 'DZP'));

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_check
  CHECK (
    source IS NULL OR source IN (
      'advertisement', 'task', 'referral', 'reward_pool', 'deposit',
      'purchase', 'conversion', 'withdrawal', 'promo', 'squad', 'admin'
    )
  );

INSERT INTO admin_settings(key, value) VALUES
  ('economy.coin_per_dzx', '1000'::jsonb),
  ('economy.dzx_per_ton', '10000'::jsonb),
  ('economy.coin_per_ton', '10000000'::jsonb),
  ('economy.coin_per_dzp', '1000'::jsonb),
  ('economy.dzx_per_dzp', '10'::jsonb),
  ('activity.reward_coin', '1000'::jsonb),
  ('activity.reward_dzx', '1'::jsonb),
  ('activity.reward_dzp', '1'::jsonb),
  ('referral.reward_coin', '10000'::jsonb),
  ('referral.reward_dzx', '10'::jsonb),
  ('referral.reward_dzp', '10'::jsonb),
  ('referral.lifetime_percent', '20'::jsonb),
  ('reward_pool.daily_dzx', '0'::jsonb),
  ('reward_pool.activation_ads', '10'::jsonb),
  ('withdrawal.min_ton', '0.2'::jsonb),
  ('withdrawal.min_coin', '2000000'::jsonb),
  ('withdrawal.min_dzx', '2000'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

DELETE FROM admin_settings WHERE key = 'reward_pool.daily_ton';
