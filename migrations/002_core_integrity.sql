-- DzMoney 2.0 core integrity hardening
-- All objects in the new core use the core_ prefix deliberately.

CREATE OR REPLACE FUNCTION core_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_core_users_updated_at ON core_users;
CREATE TRIGGER trg_core_users_updated_at
BEFORE UPDATE ON core_users
FOR EACH ROW EXECUTE FUNCTION core_touch_updated_at();

DROP TRIGGER IF EXISTS trg_core_wallet_accounts_updated_at ON core_wallet_accounts;
CREATE TRIGGER trg_core_wallet_accounts_updated_at
BEFORE UPDATE ON core_wallet_accounts
FOR EACH ROW EXECUTE FUNCTION core_touch_updated_at();

DROP TRIGGER IF EXISTS trg_core_admin_settings_updated_at ON core_admin_settings;
CREATE TRIGGER trg_core_admin_settings_updated_at
BEFORE UPDATE ON core_admin_settings
FOR EACH ROW EXECUTE FUNCTION core_touch_updated_at();

-- A wallet's accounting buckets must never exceed its total balance.
ALTER TABLE core_wallet_accounts
  DROP CONSTRAINT IF EXISTS core_wallet_account_bucket_sum_check;
ALTER TABLE core_wallet_accounts
  ADD CONSTRAINT core_wallet_account_bucket_sum_check
  CHECK (earned_balance + purchased_balance <= balance);

-- Ledger entries must match the wallet currency at write time.
CREATE OR REPLACE FUNCTION core_validate_ledger_entry_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  wallet_currency TEXT;
BEGIN
  SELECT currency INTO wallet_currency
  FROM core_wallet_accounts
  WHERE id = NEW.wallet_account_id;

  IF wallet_currency IS NULL THEN
    RAISE EXCEPTION 'core wallet account does not exist';
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

DROP TRIGGER IF EXISTS trg_core_validate_ledger_entry ON core_ledger_entries;
CREATE TRIGGER trg_core_validate_ledger_entry
BEFORE INSERT ON core_ledger_entries
FOR EACH ROW EXECUTE FUNCTION core_validate_ledger_entry_currency();

-- Keep idempotency records bounded by the uniqueness constraints defined in 001_core.
