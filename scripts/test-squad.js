const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const {
  createSquad, addMember, recordQualifyingActivity, getDailyEligibility,
  getApplicableModifier, createGoal, getGoalProgress, snapshotGoalDistribution,
} = require('../src/services/squad-service');

async function createUser(marker) {
  const result = await pool.query(
    `INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id`,
    [String(marker), `squad_${marker}`, 'Squad Test']
  );
  return result.rows[0].id;
}
async function setSetting(key, value) {
  await pool.query(`UPDATE admin_settings SET value=$2::jsonb, updated_at=NOW() WHERE key=$1`, [key, JSON.stringify(value)]);
}
async function getSetting(key) {
  const result = await pool.query(`SELECT value FROM admin_settings WHERE key=$1`, [key]);
  return result.rows[0]?.value;
}
async function cleanup(userIds, squadId, goalId) {
  await withTransaction(async client => {
    if (goalId) {
      await client.query('DELETE FROM squad_goal_distributions WHERE goal_id=$1', [goalId]);
      await client.query('DELETE FROM squad_goal_contributions WHERE goal_id=$1', [goalId]);
      await client.query('DELETE FROM squad_goals WHERE id=$1', [goalId]);
    }
    if (squadId) {
      await client.query('DELETE FROM squad_daily_bonus_days WHERE squad_id=$1', [squadId]);
      await client.query('DELETE FROM squad_activity_events WHERE squad_id=$1', [squadId]);
      await client.query('DELETE FROM squad_memberships WHERE squad_id=$1', [squadId]);
      await client.query('DELETE FROM squads WHERE id=$1', [squadId]);
    }
    if (userIds.length) await client.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
  });
}

async function main() {
  const marker = Date.now();
  const userIds = [];
  let squadId;
  let goalId;
  const original = {};
  try {
    for (const key of ['squad.inactivity_days','squad.daily_min_active_members','squad.daily_activity_threshold_percent','squad.daily_bonus_rate']) original[key] = await getSetting(key);
    await setSetting('squad.inactivity_days', 7);
    await setSetting('squad.daily_min_active_members', 4);
    await setSetting('squad.daily_activity_threshold_percent', 80);
    await setSetting('squad.daily_bonus_rate', 0.5);

    const owner = await createUser(marker + 1); userIds.push(owner);
    const a = await createUser(marker + 2); userIds.push(a);
    const b = await createUser(marker + 3); userIds.push(b);
    const c = await createUser(marker + 4); userIds.push(c);

    const created = await createSquad({ ownerUserId: owner });
    squadId = created.squad.id;
    await addMember({ squadId, userId: a, parentUserId: owner });
    await addMember({ squadId, userId: b, parentUserId: a });
    await addMember({ squadId, userId: c, parentUserId: b });

    await recordQualifyingActivity({ userId: owner, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-1` });
    await recordQualifyingActivity({ userId: a, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-2` });
    const duplicate = await recordQualifyingActivity({ userId: a, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-2` });
    assert.strictEqual(duplicate.duplicate, true);

    let daily = await getDailyEligibility({ squadId, date: new Date() });
    assert.strictEqual(daily.nextDayBonusActive, false);
    assert.strictEqual(Number(daily.snapshot.active_member_count), 4);
    assert.strictEqual(Number(daily.snapshot.active_today_count), 2);

    await recordQualifyingActivity({ userId: b, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-3` });
    await recordQualifyingActivity({ userId: c, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-4` });
    daily = await getDailyEligibility({ squadId, date: new Date() });
    assert.strictEqual(daily.nextDayBonusActive, true);
    assert.strictEqual(Number(daily.snapshot.active_today_count), 4);
    assert.strictEqual(Number(daily.snapshot.activity_percent), 100);

    const tomorrow = new Date(Date.now() + DAY_MS);
    const modifier = await getApplicableModifier({ userId: a, date: tomorrow });
    assert.strictEqual(modifier.eligible, true);
    assert.strictEqual(modifier.rate, 0.5);

    await pool.query(`UPDATE squad_memberships SET last_activity_at=NOW()-INTERVAL '8 days', active_since=NULL, status='active' WHERE user_id=$1`, [c]);
    await getDailyEligibility({ squadId, date: new Date() });
    const inactive = await pool.query(`SELECT status FROM squad_memberships WHERE user_id=$1`, [c]);
    assert.strictEqual(inactive.rows[0].status, 'inactive');

    const reactivated = await recordQualifyingActivity({ userId: c, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-reactivate` });
    assert.strictEqual(reactivated.reactivated, true);
    const activeAgain = await pool.query(`SELECT status,last_activity_at FROM squad_memberships WHERE user_id=$1`, [c]);
    assert.strictEqual(activeAgain.rows[0].status, 'active');

    const goal = await createGoal({ squadId, title: 'Weighted task goal', targetType: 'task', targetQuantity: 4, rewardPool: 10000 });
    goalId = goal.id;
    await recordQualifyingActivity({ userId: owner, activityType: 'task', quantity: 2, idempotencyKey: `squad-test-${marker}-goal-1` });
    await recordQualifyingActivity({ userId: a, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-goal-2` });
    await recordQualifyingActivity({ userId: b, activityType: 'task', quantity: 1, idempotencyKey: `squad-test-${marker}-goal-3` });
    const progress = await getGoalProgress(goalId);
    assert.strictEqual(progress.completed, true);
    assert.strictEqual(progress.contributorCount, 3);

    const distribution = await snapshotGoalDistribution(goalId);
    assert.strictEqual(distribution.duplicate, false);
    const amounts = Object.fromEntries(distribution.distributions.map(row => [String(row.user_id), Number(row.reward_amount)]));
    assert.strictEqual(amounts[String(owner)], 5000);
    assert.strictEqual(amounts[String(a)], 2500);
    assert.strictEqual(amounts[String(b)], 2500);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(amounts, String(c)), false);

    console.log('Phase 4 Squad engine invariants: PASS');
  } catch (error) {
    console.error('Phase 4 Squad engine invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      for (const [key, value] of Object.entries(original)) await setSetting(key, value);
      await cleanup(userIds, squadId, goalId);
    } catch (cleanupError) {
      console.error('Phase 4 Squad test cleanup: FAIL');
      console.error(cleanupError);
      process.exitCode = 1;
    }
    await pool.end();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
main().catch(error => {
  console.error('Phase 4 Squad test runner: FAIL');
  console.error(error);
  process.exit(1);
});
