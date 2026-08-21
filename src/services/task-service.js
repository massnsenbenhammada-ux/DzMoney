const { withTransaction, query } = require('../db/pool');

const TASK_TYPES = ['daily', 'game', 'social', 'web', 'special'];
const TASK_STATUSES = ['draft', 'pending_review', 'active', 'paused', 'completed', 'expired', 'closed', 'refunded'];
const VERIFICATION_SECONDS = [5, 10];

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function normalizeReward(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

async function getActivitySetting(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) ? value : fallback;
}

/** Return active tasks for the catalog, optionally restricted to one category. */
async function listActiveTasks({ taskType = null } = {}) {
  if (taskType !== null && !TASK_TYPES.includes(taskType)) throw new Error('Invalid task type');
  const params = taskType ? [taskType] : [];
  const filter = taskType ? 'AND task_type=$1' : '';
  const result = await query(
    `SELECT id, task_type, title, description, reward_coin, reward_dzx, reward_dzp, verification_ad_seconds
     FROM activity_tasks WHERE status='active' ${filter} ORDER BY id`,
    params
  );
  return result.rows.map(row => ({
    id: row.id,
    taskType: row.task_type,
    title: row.title,
    description: row.description,
    rewardCoin: Number(row.reward_coin),
    rewardDzx: Number(row.reward_dzx),
    rewardDzp: Number(row.reward_dzp),
    verificationAdSeconds: row.verification_ad_seconds
  }));
}

async function createTask({ taskType, title, description = null, rewardCoin, rewardDzx, rewardDzp, verificationAdSeconds = null, config = {} }) {
  if (!TASK_TYPES.includes(taskType)) throw new Error('Invalid task type');
  if (!title) throw new Error('title is required');
  return withTransaction(async client => {
    const configuredSeconds = verificationAdSeconds ?? await getActivitySetting(client, 'activity.verification_ad_seconds', 5);
    if (!VERIFICATION_SECONDS.includes(Number(configuredSeconds))) throw new Error('verification ad duration must be 5 or 10 seconds');
    const rewards = {
      coin: normalizeReward(rewardCoin, 'rewardCoin'),
      dzx: normalizeReward(rewardDzx, 'rewardDzx'),
      dzp: normalizeReward(rewardDzp, 'rewardDzp')
    };
    if (!rewards.coin && !rewards.dzx && !rewards.dzp) throw new Error('At least one task reward is required');
    const result = await client.query(
      `INSERT INTO activity_tasks(task_type,title,description,reward_coin,reward_dzx,reward_dzp,verification_ad_seconds,status,config)
       VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8) RETURNING *`,
      [taskType, title, description, rewards.coin, rewards.dzx, rewards.dzp, Number(configuredSeconds), config]
    );
    return result.rows[0];
  });
}

async function activateTask(taskId) {
  const result = await query(
    `UPDATE activity_tasks SET status='active',updated_at=NOW()
     WHERE id=$1 AND status IN('draft','pending_review','paused') RETURNING *`,
    [requiredId(taskId, 'taskId')]
  );
  if (!result.rowCount) throw new Error('Task cannot be activated from its current state');
  return result.rows[0];
}

async function getTask(taskId) {
  const result = await query('SELECT * FROM activity_tasks WHERE id=$1', [requiredId(taskId, 'taskId')]);
  if (!result.rowCount) throw new Error('Task not found');
  return result.rows[0];
}

async function executeTask({ taskId, userId, idempotencyKey, metadata = {} }) {
  requiredId(taskId, 'taskId');
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const taskResult = await client.query('SELECT * FROM activity_tasks WHERE id=$1 FOR SHARE', [taskId]);
    if (!taskResult.rowCount) throw new Error('Task not found');
    const task = taskResult.rows[0];
    if (task.status !== 'active') throw new Error('Task is not active');

    const existing = await client.query('SELECT * FROM task_attempts WHERE execute_idempotency_key=$1 FOR SHARE', [idempotencyKey]);
    if (existing.rowCount) return { attempt: existing.rows[0], duplicate: true };

    const attempt = await client.query(
      `INSERT INTO task_attempts(task_id,user_id,status,execute_idempotency_key,metadata)
       VALUES($1,$2,'verification_pending',$3,$4) RETURNING *`,
      [taskId, userId, idempotencyKey, metadata]
    );
    const gate = await client.query(
      `INSERT INTO task_verification_gates(attempt_id,required_seconds,idempotency_key,metadata)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [attempt.rows[0].id, task.verification_ad_seconds, `verification:${attempt.rows[0].id}`, { task_id: taskId }]
    );
    return { task, attempt: attempt.rows[0], gate: gate.rows[0], duplicate: false };
  });
}

module.exports = { TASK_TYPES, TASK_STATUSES, VERIFICATION_SECONDS, createTask, activateTask, getTask, listActiveTasks, executeTask };
