ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS network TEXT;

ALTER TABLE deposits
  DROP CONSTRAINT IF EXISTS deposits_network_check;

ALTER TABLE deposits
  ADD CONSTRAINT deposits_network_check
  CHECK (network IS NULL OR network IN ('mainnet', 'testnet'));

INSERT INTO admin_settings(key, value) VALUES
  ('deposit.ton.active_network', '"mainnet"'::jsonb)
ON CONFLICT (key) DO NOTHING;
