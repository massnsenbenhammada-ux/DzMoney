const { withTransaction, query } = require('../db/pool');

const ACTION_STATUS = Object.freeze({ suspend: 'suspended', ban: 'banned', activate: 'active' });

function requireReason(reason) {
  const value = String(reason || '').trim();
  if (!value) throw new Error('reason is required');
  if (value.length > 500) throw new Error('reason is too long');
  return value;
}

function requireAction(action) {
  if (!Object.prototype.hasOwnProperty.call(ACTION_STATUS, action)) throw new Error('Unsupported enforcement action');
  return action;
}

async function getEnforcementState(userId) {
  const result = await query(
    `SELECT u.id, u.account_status, sm.id AS membership_id, sm.status AS membership_status
     FROM users u
     LEFT JOIN squad_memberships sm ON sm.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!result.rowCount) throw new Error('User not found');
  const row = result.rows[0];
  return { accountStatus: row.account_status, membershipId: row.membership_id ? String(row.membership_id) : null, membershipStatus: row.membership_status || null };
}

async function setAccountStatus({ userId, action, reason, evidence = null, idempotencyKey, actorTelegramUserId }) {
  const normalizedAction = requireAction(action);
  const normalizedReason = requireReason(reason);
  const key = String(idempotencyKey || '').trim();
  if (!key) throw new Error('idempotencyKey is required');
  if (key.length > 200) throw new Error('idempotencyKey is too long');
  if (!actorTelegramUserId) throw new Error('actorTelegramUserId is required');
  return withTransaction(async client => {
    const user = await client.query('SELECT id, account_status FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new Error('User not found');
    const targetStatus = ACTION_STATUS[normalizedAction];
    const existing = await client.query('SELECT response FROM idempotency_records WHERE key = $1 FOR SHARE', [`admin-account-status:${key}`]);
    if (existing.rowCount) return { ...(existing.rows[0].response || {}), duplicate: true };

    const membership = await client.query('SELECT id, status FROM squad_memberships WHERE user_id = $1 FOR UPDATE', [userId]);
    const membershipStatus = normalizedAction === 'ban' ? 'cancelled' : normalizedAction === 'suspend' ? 'suspended' : 'active';
    await client.query('UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2', [targetStatus, userId]);
    if (membership.rowCount) await client.query('UPDATE squad_memberships SET status = $1 WHERE id = $2', [membershipStatus, membership.rows[0].id]);
    const audit = {
      action: normalizedAction,
      reason: normalizedReason,
      evidence: evidence == null ? null : String(evidence).slice(0, 2000),
      previous_account_status: user.rows[0].account_status,
      new_account_status: targetStatus,
      previous_membership_status: membership.rows[0]?.status || null,
      new_membership_status: membership.rowCount ? membershipStatus : null,
      idempotency_key: key,
    };
    const response = { duplicate: false, accountStatus: targetStatus, membershipStatus: membership.rowCount ? membershipStatus : null, userId: String(userId) };
    await client.query('INSERT INTO idempotency_records(key, response) VALUES ($1, $2::jsonb)', [`admin-account-status:${key}`, JSON.stringify(response)]);
    await client.query(
      `INSERT INTO admin_audit_log(setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
      [`user.account_status:${userId}`, JSON.stringify({ accountStatus: user.rows[0].account_status, membershipStatus: membership.rows[0]?.status || null }), JSON.stringify(audit), actorTelegramUserId]
    );
    return response;
  });
}

module.exports = { getEnforcementState, setAccountStatus, requireAction, requireReason };
