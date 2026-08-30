const { query } = require('../db/pool');
const taskService = require('./task-service');
const referralService = require('./referral-service');
const { isRolling24HourAvailable, isUtcPlusOneCalendarDayAvailable, isReferralAchievementClaimable, DAILY_SYSTEM_TASKS } = require('./daily-system-task-contract');

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

async function getLatestDailyCompletion(task, userId) {
  const result = await query(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(verified_at) FROM task_attempts WHERE task_id=$1 AND user_id=$2 AND status='verified'), '-infinity'::timestamptz),
       COALESCE((SELECT last_claimed_at FROM daily_checkins WHERE user_id=$2), '-infinity'::timestamptz)
     ) AS completed_at`,
    [task.id, requiredId(userId, 'userId')]
  );
  const completedAt = result.rows[0]?.completed_at;
  return completedAt && completedAt !== '-infinity' ? completedAt : null;
}

async function assertAvailable(task, userId, now = new Date()) {
  const completedAt = await getLatestDailyCompletion(task, userId);
  if (!completedAt) return true;
  const policy = task.config?.dailyPolicy;
  if (policy === 'rolling_24h') return isRolling24HourAvailable(completedAt, now);
  if (policy === 'utc_plus_one_calendar_day') return isUtcPlusOneCalendarDayAvailable(completedAt, now);
  throw new Error('Unsupported daily task policy');
}

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
    throw new Error('Daily task is already completed for the current eligibility window');
  }
  requiredId(idempotencyKey, 'idempotencyKey');
  const dailyKey = `daily:${task.id}:${userId}:${idempotencyKey}`;
  return taskService.executeTask({
    taskId: task.id,
    userId,
    idempotencyKey: dailyKey,
    metadata: { ...metadata, system_key: systemKey },
    allowPendingRetry: systemKey === DAILY_SYSTEM_TASKS.CHECK_IN
  });
}

module.exports = { getSystemTask, assertAvailable, assertAdvertisementAvailable, assertReferralAchievementAvailable, executeSystemTask };