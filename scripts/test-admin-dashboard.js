const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { getAdminDashboardMetrics } = require('../src/services/admin-dashboard-service');

const UTC_PLUS_ONE = 'Etc/GMT-1';

async function insertAd(userId, suffix, offsetDays) {
  await query(
    `INSERT INTO activity_ad_events(user_id, context, idempotency_key, started_at, completed_at, verified)
     VALUES ($1, 'verification', $2, NOW() - ($3::int * INTERVAL '1 day'), NOW() - ($3::int * INTERVAL '1 day'), TRUE)`,
    [userId, `admin-dashboard-ad:${suffix}`, offsetDays]
  );
}

async function insertTaskAttempt(userId, taskId, suffix, offsetDays) {
  await query(
    `INSERT INTO task_attempts(task_id, user_id, status, execute_idempotency_key, verify_idempotency_key, executed_at, verified_at)
     VALUES ($1, $2, 'verified', $3, $4, NOW() - ($5::int * INTERVAL '1 day'), NOW() - ($5::int * INTERVAL '1 day'))`,
    [taskId, userId, `admin-dashboard-exec:${suffix}`, `admin-dashboard-verify:${suffix}`, offsetDays]
  );
}

test('Admin dashboard aggregates members, verified ads, verified tasks and seven UTC+1 days', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const userIds = [];
  let taskId;
  try {
    const before = await getAdminDashboardMetrics();
    const user1 = await walletService.createUser({ telegramUserId: `9${suffix}1`, username: `admin_dashboard_${suffix}_1` });
    const user2 = await walletService.createUser({ telegramUserId: `9${suffix}2`, username: `admin_dashboard_${suffix}_2` });
    userIds.push(user1.id, user2.id);

    const task = await query(
      `INSERT INTO activity_tasks(task_type, title, reward_coin, reward_dzx, reward_dzp, status)
       VALUES ('web', $1, 1, 1, 1, 'active') RETURNING id`,
      [`Admin dashboard task ${suffix}`]
    );
    taskId = task.rows[0].id;

    await insertAd(user1.id, `${suffix}-today-a`, 0);
    await insertAd(user2.id, `${suffix}-today-b`, 0);
    await insertAd(user1.id, `${suffix}-yesterday`, 1);
    await insertTaskAttempt(user1.id, taskId, `${suffix}-today-a`, 0);
    await insertTaskAttempt(user2.id, taskId, `${suffix}-today-b`, 0);
    await insertTaskAttempt(user1.id, taskId, `${suffix}-yesterday`, 1);

    const after = await getAdminDashboardMetrics();
    assert.equal(after.realtime.totalMembers, before.realtime.totalMembers + 2);
    assert.equal(after.realtime.advertisementsWatched, before.realtime.advertisementsWatched + 3);
    assert.equal(after.realtime.tasksCompleted, before.realtime.tasksCompleted + 3);
    assert.equal(after.sevenDay.length, 7);

    const todayKey = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
    const yesterdayKey = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const beforeToday = before.sevenDay.find(row => row.date === todayKey);
    const afterToday = after.sevenDay.find(row => row.date === todayKey);
    const beforeYesterday = before.sevenDay.find(row => row.date === yesterdayKey);
    const afterYesterday = after.sevenDay.find(row => row.date === yesterdayKey);

    assert.ok(beforeToday && afterToday && beforeYesterday && afterYesterday);
    assert.equal(afterToday.advertisementsWatched, beforeToday.advertisementsWatched + 2);
    assert.equal(afterToday.tasksCompleted, beforeToday.tasksCompleted + 2);
    assert.equal(afterToday.totalMembers, beforeToday.totalMembers + 2);
    assert.equal(afterYesterday.advertisementsWatched, beforeYesterday.advertisementsWatched + 1);
    assert.equal(afterYesterday.tasksCompleted, beforeYesterday.tasksCompleted + 1);
    assert.equal(afterYesterday.totalMembers, beforeYesterday.totalMembers);
  } finally {
    if (taskId) await query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    if (userIds.length) {
      await query('DELETE FROM activity_ad_events WHERE user_id = ANY($1::bigint[])', [userIds]);
      await query('DELETE FROM task_attempts WHERE user_id = ANY($1::bigint[])', [userIds]);
      await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
    }
  }
  await pool.end();
});
