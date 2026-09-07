'use strict';

const { query, withTransaction } = require('../db/pool');
const taskService = require('./task-service');

async function listAdminTasks({ status = null } = {}) {
  const allowed = new Set(taskService.TASK_STATUSES);
  if (status !== null && !allowed.has(status)) throw new Error('Invalid task status');
  const params = status === null ? [] : [status];
  const filter = status === null ? '' : ' AND status=$1';
  const result = await query(
    `SELECT id, task_type, title, description, creator_id, target, reward_coin, reward_dzx, reward_dzp,
            verification_ad_seconds, status, config, created_at, updated_at
       FROM activity_tasks
      WHERE creator_id IS NOT NULL${filter}
      ORDER BY id DESC`,
    params
  );
  return result.rows;
}

async function reviewCreatorCampaign({ taskId, action, actorTelegramUserId, reason, idempotencyKey }) {
  if (!actorTelegramUserId) throw new Error('actorTelegramUserId is required');
  if (!reason || !String(reason).trim()) throw new Error('reason is required');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!['approve', 'reject'].includes(action)) throw new Error('Invalid review action');

  const key = `admin-task-review:${idempotencyKey}`;
  const existing = await query('SELECT response FROM idempotency_records WHERE key=$1', [key]);
  if (existing.rowCount) return { ...(existing.rows[0].response || {}), duplicate: true };

  const task = await taskService.getTask(taskId);
  if (task.creator_id === null || task.creator_id === undefined) throw new Error('Only creator campaigns can be reviewed');
  const previousStatus = task.status;
  const result = action === 'approve'
    ? await taskService.approveCreatorCampaign(taskId)
    : await taskService.rejectCreatorCampaign(taskId, task.creator_id);

  const response = {
    duplicate: false,
    task: result.task || result,
    action,
    previousStatus,
    status: (result.task || result).status
  };

  await withTransaction(async client => {
    await client.query(
      `INSERT INTO admin_audit_log(setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1,$2::jsonb,$3::jsonb,$4)`,
      [
        `task.review:${task.id}`,
        JSON.stringify({ status: previousStatus }),
        JSON.stringify({ status: response.status, action, reason: String(reason).trim().slice(0, 500) }),
        actorTelegramUserId
      ]
    );
    await client.query(
      'INSERT INTO idempotency_records(key, response) VALUES ($1,$2::jsonb)',
      [key, JSON.stringify(response)]
    );
  });

  return response;
}

module.exports = { listAdminTasks, reviewCreatorCampaign };
