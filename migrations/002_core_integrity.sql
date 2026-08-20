-- DzMoney 2.0 core integrity hardening
-- No business feature tables are introduced here.

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_wallet_accounts_updated_at ON wallet_accounts;
CREATE TRIGGER trg_wallet_accounts_updated_at
BEFORE UPDATE ON wallet_accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_admin_settings_updated_at ON admin_settings;
CREATE TRIGGER trg_admin_settings_updated_at
BEFORE UPDATE ON admin_settings
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- A wallet's accounting buckets must never exceed its total balance.
ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_account_bucket_sum_check;
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_account_bucket_sum_check
  CHECK (earned_balance + purchased_balance <= balance);

-- Ledger entries must match the wallet currency at write time.
CREATE OR REPLACE FUNCTION validate_ledger_entry_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE wallet_currency TEXT;
BEGIN
  SELECT currency INTO wallet_currency
  FROM wallet_accounts
  WHERE id = NEW.wallet_account_id;

  IF wallet_currency IS NULL THEN
    RAISE EXCEPTION 'wallet account does not exist';
  END IF;
  IF wallet_currency <> NEW.currency THEN
    RAISE EXCEPTION 'ledger currency does not match wallet currency';
  END IF;
  IF NEW.balance_after <> NEW.balance_before + NEW.amount THEN
    RAISE EXCEPTION 'ledger balance arithmetic mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ledger_entry ON ledger_entries;
CREATE TRIGGER trg_validate_ledger_entry
BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_ledger_entry_currency();

-- Keep idempotency records bounded by operation/user/key uniqueness already defined in 001_core.
