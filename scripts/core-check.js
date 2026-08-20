const { getPool } = require('../src/db/pool');

const requiredTables = [
  'users',
  'wallet_accounts',
  'ledger_transactions',
  'ledger_entries',
  'admin_settings',
  'audit_log',
  'idempotency_records',
  'schema_migrations',
];

(async () => {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    for (const table of requiredTables) {
      const result = await pool.query(
        `SELECT to_regclass($1) AS table_name`,
        [table]
      );
      if (!result.rows[0].table_name) throw new Error(`missing table: ${table}`);
    }

    const migrations = await pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    console.log(`Core database check: OK (${migrations.rowCount} migrations applied)`);
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(`Core database check failed: ${error.message}`);
  process.exitCode = 1;
});
