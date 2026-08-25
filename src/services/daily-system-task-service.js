const { query } = require('../db/pool');
const taskService = require('./task-service');
const referralService = require('./referral-service');
const { isUtcPlusOneCalendarDayAvailable, isReferralAchievementClaimable } = require('./daily-system-task-contract');

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function getSystemTask(systemKey) {
  requiredId(systemKey, 'systemKey');
  const result = await query(
    `SELECT * FROM activity_tasks
     WHERE task_type='daily' AND status='active' AND config->>'systemKey'=$1
     ORDER BY id LIMIT 1`,
    [systemKey]
  );
  if (!result.rowCount) throw new Error('Daily system task not found');
  return result.rows[0];
}

/** Checks rolling/calendar-day availability for ordinary Daily tasks. */
async function assertAvailable(task, userId, now = new Date()) {
  const result = await query(
    `SELECT verified_at FROM task_attempts
     WHERE task_id=$1 AND user_id=$2 AND status='verified'
     ORDER BY verified_at DESC LIMIT 1`,
    [task.id, requiredId(userId, 'userId')]
  );
  if (!result.rowCount) return true;
  const policy = task.config?.dailyPolicy;
  if (policy !== 'utc_plus_one_calendar_day') throw new Error('Unsupported daily task policy');
  return isUtcPlusOneCalendarDayAvailable(result.rows[0].verified_at, now);
}

/** Checks whether a Tasks-page advertisement can start in the current UTC+1 day. */
async function assertAdvertisementAvailable(task, userId, now = new Date()) {
  const result = await query(
    `SELECT completed_at FROM activity_ad_events
     WHERE user_id=$1 AND context='task' AND verified=TRUE AND metadata->>'task_id'=$2
     ORDER BY completed_at DESC LIMIT 1`,
    [requiredId(userId, 'userId'), String(task.id)]
  );
  if (!result.rowCount) return true;
  if (task.config?.dailyPolicy !== 'utc_plus_one_calendar_day') throw new Error('Unsupported daily task policy');
  return isUtcPlusOneCalendarDayAvailable(result.rows[0].completed_at, now);
}

/** Checks permanent referral achievement eligibility and one-time claim state. */
async function assertReferralAchievementAvailable(task, userId) {
  const threshold = Number(task.config?.achievementThreshold);
  if (!Number.isInteger(threshold) || threshold <= 0) throw new Error('Invalid referral achievement threshold');
  const qualified = await referralService.getQualifiedReferralCount(userId);
  const claimed = await query(
    `SELECT 1 FROM task_attempts WHERE task_id=$1 AND user_id=$2 AND status='verified' LIMIT 1`,
    [task.id, requiredId(userId, 'userId')]
  );
  return isReferralAchievementClaimable(qualified, threshold, claimed.rowCount > 0);
}

async function executeSystemTask({ systemKey, userId, idempotencyKey, metadata = {} }) {
  const task = await getSystemTask(systemKey);
  if (task.config?.achievementThreshold !== undefined) {
    if (!await assertReferralAchievementAvailable(task, userId)) throw new Error('Referral achievement is not claimable');
  } else if (!await assertAvailable(task, userId)) {
    throw new Error('Daily task is already completed for the current UTC+1 day');
  }
  requiredId(idempotencyKey, 'idempotencyKey');
  const dailyKey = `daily:${task.id}:${userId}:${idempotencyKey}`;
  return taskService.executeTask({ taskId: task.id, userId, idempotencyKey: dailyKey, metadata: { ...metadata, system_key: systemKey } });
}

module.exports = { getSystemTask, assertAvailable, assertAdvertisementAvailable, assertReferralAchievementAvailable, executeSystemTask };
