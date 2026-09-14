ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_dzp_sources_not_above_balance;
