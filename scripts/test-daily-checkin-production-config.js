const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('../src/db/pool');

async function main() {
  const migrationPath = path.join(__dirname, '..', 'migrations', '028_daily_checkin_config_repair.sql');
  assert.ok(fs.existsSync(migrationPath), 'Expected the production config repair migration');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /UPDATE\s+activity_tasks/i);
  assert.match(migration, /daily_check_in/);
  assert.match(migration, /dailyMode/);

  const result = await pool.query(`SELECT id FROM activity_tasks WHERE task_type='daily' AND config->>'systemKey'='daily_check_in' AND status='active' ORDER BY id`);
  assert.strictEqual(result.rowCount, 1, 'Expected exactly one active canonical Daily Check-in task');

  await withTransaction(async client => {
    const taskId = result.rows[0].id;
    await client.query(`UPDATE activity_tasks SET config=config-'dailyMode' WHERE id=$1`, [taskId]);
    const legacy = await client.query('SELECT config FROM activity_tasks WHERE id=$1', [taskId]);
    assert.strictEqual(legacy.rows[0].config?.dailyMode, undefined);

    await client.query(migration);

    const repaired = await client.query('SELECT config FROM activity_tasks WHERE id=$1', [taskId]);
    assert.strictEqual(repaired.rows[0].config?.dailyPolicy, 'rolling_24h');
    assert.strictEqual(repaired.rows[0].config?.dailyMode, 'advertisement');
  });

  console.log('Daily Check-in production config contract: PASS');
}

main().catch(error => {
  console.error('Daily Check-in production config contract: FAIL');
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await pool.end();
});
