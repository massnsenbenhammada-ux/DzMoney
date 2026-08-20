const fs = require('fs');
const path = require('path');
const { query, withTransaction } = require('../src/db/pool');

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const filename of files) {
    const exists = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (exists.rowCount) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    await withTransaction(async client => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
    });
    console.log(`Migration applied: ${filename}`);
  }
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
