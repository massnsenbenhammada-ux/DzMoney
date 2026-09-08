'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { startTaskAdvertisement } = require('../src/services/task-advertisement-service');

const provider = id => ({ id, contexts: ['squad'], async verifyCompletion() { return { verified: false }; } });
const registry = new AdProviderRegistry([provider('monetag'), provider('adsgram'), provider('onclicka')]);

async function main() {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let userId;
  let taskId;
  try {
    const telegramUserId = String(BigInt(Date.now()) * 10n + 9n);
    const user = await pool.query('INSERT INTO users (telegram_user_id,username,first_name) VALUES ($1,$2,$3) RETURNING id', [telegramUserId, `squad_load_${marker}`, 'Squad Load']);
    userId = user.rows[0].id;
    const task = await pool.query(`INSERT INTO activity_tasks (task_type,title,reward_coin,reward_dzx,reward_dzp,status,config) VALUES ('daily','Squad Ads load',1000,1,1,'active',$1) RETURNING id`, [{ systemKey: 'squad_ads', advertisementTarget: 1000, advertisementContext: 'squad' }]);
    taskId = task.rows[0].id;

    const timings = [];
    const results = await Promise.all(Array.from({ length: 24 }, (_, index) => (async () => {
      const started = performance.now();
      const result = await startTaskAdvertisement({ userId, taskId, idempotencyKey: `squad-load-${marker}-${index}`, providerRegistry: registry });
      timings.push(performance.now() - started);
      return result;
    })()));
    assert.equal(results.length, 24);
    assert.equal(new Set(results.map(result => result.adEvent.id)).size, 24);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context=\'squad\'', [userId])).rows[0].count, 24);
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
    assert.ok(p95 < 2000, `Squad advertisement allocation p95 too high: ${p95.toFixed(1)}ms`);
    console.log(`Squad Ads load gate: PASS (n=${timings.length}, p95=${p95.toFixed(1)}ms, max=${Math.max(...timings).toFixed(1)}ms)`);
  } finally {
    await withTransaction(async client => {
      if (userId) await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
      if (taskId) await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
      if (userId) await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
      if (userId) await client.query('DELETE FROM users WHERE id=$1', [userId]);
    });
    await pool.end();
  }
}

main().catch(error => { console.error('Squad Ads load gate: FAIL'); console.error(error); process.exit(1); });
