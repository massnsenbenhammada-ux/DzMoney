const { query } = require('../src/db/pool');

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

  const report = {
    ok: [negative, dzpMismatch, ledgerMismatch, invalidCurrency].every(r => r.rowCount === 0),
    negative_wallets: negative.rowCount,
    dzp_source_mismatches: dzpMismatch.rowCount,
    ledger_mismatches: ledgerMismatch.rowCount,
    invalid_ledger_currencies: invalidCurrency.rowCount,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error('Economy reconciliation failed:', error);
  process.exit(1);
});
