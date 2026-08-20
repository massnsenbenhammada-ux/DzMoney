-- Phase 1 integrity hardening.
-- Keep accounting isolated and queryable before higher-level reward systems are added.

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user_currency
  ON wallet_accounts(user_id, currency);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created
  ON ledger_entries(wallet_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_source_created
  ON ledger_entries(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_user_created
  ON ledger_transactions(user_id, created_at DESC);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_balance_after_nonnegative
  CHECK (balance_after >= 0);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_balance_delta_consistent
  CHECK (ABS(balance_after - (balance_before + amount)) < 0.000000001);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_currency_matches_wallet
  CHECK (currency IN ('COIN', 'DZX', 'DZP'));

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_dzp_buckets_nonnegative
  CHECK (earned_dzp >= 0 AND converted_dzp >= 0 AND purchased_dzp >= 0);

-- The three DZP source buckets must never exceed the actual DZP balance.
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_dzp_sources_not_above_balance
  CHECK (
    currency <> 'DZP'
    OR earned_dzp + converted_dzp + purchased_dzp <= balance + 0.000000001
  );
