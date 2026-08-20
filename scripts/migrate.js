const fs = require('fs');
const path = require('path');
const { query, withTransaction } = require('../src/db/pool');

// DzMoney 2.0 uses its own migration registry so no schema/table from an
// older project can interfere with the fresh database.
const MIGRATION_TABLE = 'dzmoney_schema_migrations';

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort();

  for (const filename of files) {
    const exists = await query(
      `SELECT 1 FROM ${MIGRATION_TABLE} WHERE filename = $1`,
      [filename]
    );
    if (exists.rowCount) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    await withTransaction(async client => {
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATION_TABLE}(filename) VALUES($1)`,
        [filename]
      );
    });
    console.log(`Migration applied: ${filename}`);
  }

  console.log('DzMoney migrations: OK');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
