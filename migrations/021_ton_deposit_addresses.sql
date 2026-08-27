INSERT INTO admin_settings(key, value) VALUES
  ('deposit.ton.testnet_address', 'null'::jsonb),
  ('deposit.ton.mainnet_address', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
