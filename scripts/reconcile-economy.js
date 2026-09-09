const { query } = require("../src/db/pool");

async function main() {
  const negative = await query(`
    SELECT id, user_id, currency, balance
    FROM wallet_accounts
    WHERE balance < 0 OR earned_dzp < 0 OR converted_dzp < 0 OR purchased_dzp < 0
  `);

  const dzpMismatch = await query(`
    SELECT id, user_id, balance, earned_dzp, converted_dzp, purchased_dzp
    FROM wallet_accounts
    WHERE currency = 'DZP'
      AND earned_dzp + converted_dzp + purchased_dzp > balance + 0.000000001
  `);

  const ledgerMismatch = await query(`
    SELECT id, transaction_id, wallet_account_id, currency,
           amount, balance_before, balance_after
    FROM ledger_entries
    WHERE ABS(balance_after - (balance_before + amount)) >= 0.000000001
  `);

  const invalidCurrency = await query(`
    SELECT id, wallet_account_id, currency
    FROM ledger_entries
    WHERE currency NOT IN ('COIN', 'DZX', 'DZP')
  `);

  const ledgerBalanceMismatch = await query(`
    SELECT wa.id, wa.user_id, wa.currency, wa.balance,
           COALESCE(SUM(le.amount), 0) AS ledger_balance
    FROM wallet_accounts wa
    LEFT JOIN ledger_entries le ON le.wallet_account_id = wa.id
    GROUP BY wa.id, wa.user_id, wa.currency, wa.balance
    HAVING ABS(wa.balance - COALESCE(SUM(le.amount), 0)) >= 0.000000001
  `);

  const ledgerChainMismatch = await query(`
    SELECT current_entry.id AS current_entry_id,
           next_entry.id AS next_entry_id,
           current_entry.wallet_account_id,
           current_entry.balance_after,
           next_entry.balance_before
    FROM ledger_entries current_entry
    JOIN ledger_entries next_entry
      ON next_entry.wallet_account_id = current_entry.wallet_account_id
     AND next_entry.id = (
       SELECT MIN(candidate.id)
       FROM ledger_entries candidate
       WHERE candidate.wallet_account_id = current_entry.wallet_account_id
         AND candidate.id > current_entry.id
     )
    WHERE ABS(next_entry.balance_before - current_entry.balance_after) >= 0.000000001
  `);

  const report = {
    ok: [
      negative,
      dzpMismatch,
      ledgerMismatch,
      invalidCurrency,
      ledgerBalanceMismatch,
      ledgerChainMismatch,
    ].every((r) => r.rowCount === 0),
    negative_wallets: negative.rowCount,
    dzp_source_mismatches: dzpMismatch.rowCount,
    ledger_mismatches: ledgerMismatch.rowCount,
    invalid_ledger_currencies: invalidCurrency.rowCount,
    ledger_balance_mismatches: ledgerBalanceMismatch.rowCount,
    ledger_chain_mismatches: ledgerChainMismatch.rowCount,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Economy reconciliation failed:", error);
  process.exit(1);
});
