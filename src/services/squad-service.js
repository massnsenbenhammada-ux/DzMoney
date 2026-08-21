const { withTransaction, query } = require('../db/pool');

const DAY_MS = 24 * 60 * 60 * 1000;

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function positiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) ? value : fallback;
}

async function refreshMembershipStatuses(client, squadId, now = new Date()) {
  const inactivityDays = await settingNumber(client, 'squad.inactivity_days', 7);
  if (!Number.isInteger(inactivityDays) || inactivityDays <= 0) throw new Error('squad.inactivity_days must be a positive integer');
  const cutoff = new Date(now.getTime() - inactivityDays * DAY_MS);
  await client.query(
    `UPDATE squad_memberships
        SET status = 'inactive', updated_at = NOW()
      WHERE squad_id = $1
        AND status = 'active'
        AND ((last_activity_at IS NOT NULL AND last_activity_at < $2)
             OR (last_activity_at IS NULL AND joined_at < $2))`,
    [squadId, cutoff]
  );
  return inactivityDays;
}

async function createSquad({ ownerUserId }) {
  required(ownerUserId, 'ownerUserId');
  return withTransaction(async client => {
    const existing = await client.query('SELECT * FROM squads WHERE owner_user_id = $1', [ownerUserId]);
    if (existing.rowCount) return { squad: existing.rows[0], duplicate: true };
    const squadResult = await client.query(`INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING *`, [ownerUserId]);
    await client.query(`INSERT INTO squad_memberships (squad_id, user_id, parent_user_id, active_since) VALUES ($1, $2, NULL, NOW())`, [squadResult.rows[0].id, ownerUserId]);
    return { squad: squadResult.rows[0], duplicate: false };
  });
}

async function addMember({ squadId, userId, parentUserId = null }) {
  required(squadId, 'squadId');
  required(userId, 'userId');
  return withTransaction(async client => {
    const squad = await client.query('SELECT * FROM squads WHERE id = $1 FOR SHARE', [squadId]);
    if (!squad.rowCount || squad.rows[0].status !== 'active') throw new Error('Squad is not active');
    const existing = await client.query('SELECT * FROM squad_memberships WHERE user_id = $1 FOR SHARE', [userId]);
    if (existing.rowCount) {
      if (String(existing.rows[0].squad_id) !== String(squadId)) throw new Error('User already belongs to another squad');
      return { membership: existing.rows[0], duplicate: true };
    }
    if (parentUserId !== null) {
      const parent = await client.query('SELECT * FROM squad_memberships WHERE squad_id = $1 AND user_id = $2 FOR SHARE', [squadId, parentUserId]);
      if (!parent.rowCount || ['removed', 'suspended'].includes(parent.rows[0].status)) throw new Error('Parent is not a valid squad member');
    }
    const membership = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, parent_user_id, active_since) VALUES ($1,$2,$3,NOW()) RETURNING *`, [squadId, userId, parentUserId]);
    return { membership: membership.rows[0], duplicate: false };
  });
}

async function recordQualifyingActivity({ userId, activityType, activityId = null, quantity = 1, occurredAt = new Date(), idempotencyKey, metadata = {} }) {
  required(userId, 'userId');
  required(activityType, 'activityType');
  required(idempotencyKey, 'idempotencyKey');
  const amount = positiveNumber(quantity, 'quantity');
  return withTransaction(async client => {
    const membership = await client.query(`SELECT * FROM squad_memberships WHERE user_id = $1 AND status <> 'removed' FOR UPDATE`, [userId]);
    if (!membership.rowCount) return { recorded: false, reason: 'not_in_squad' };
    const row = membership.rows[0];
    const existing = await client.query('SELECT * FROM squad_activity_events WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rowCount) return { recorded: true, duplicate: true, event: existing.rows[0] };

    const inactivityDays = await settingNumber(client, 'squad.inactivity_days', 7);
    if (!Number.isInteger(inactivityDays) || inactivityDays <= 0) throw new Error('squad.inactivity_days must be a positive integer');
    const cutoff = new Date(occurredAt.getTime() - inactivityDays * DAY_MS);
    const wasInactive = row.status === 'inactive' ||
      (row.last_activity_at !== null && row.last_activity_at < cutoff) ||
      (row.last_activity_at === null && row.joined_at < cutoff);

    const event = await client.query(
      `INSERT INTO squad_activity_events
        (squad_id,user_id,activity_type,activity_id,quantity,occurred_at,idempotency_key,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.squad_id, userId, activityType, activityId, amount, occurredAt, idempotencyKey, metadata]
    );
    await client.query(
      `UPDATE squad_memberships
          SET last_activity_at = $1, active_since = CASE WHEN $3 THEN $1 ELSE active_since END,
              status = CASE WHEN $3 THEN 'active' ELSE status END,
              updated_at = NOW()
        WHERE id = $2`,
      [occurredAt, row.id, wasInactive]
    );
    return { recorded: true, duplicate: false, reactivated: wasInactive, event: event.rows[0] };
  });
}

async function getSquad(squadId) {
  const result = await query('SELECT * FROM squads WHERE id = $1', [required(squadId, 'squadId')]);
  if (!result.rowCount) throw new Error('Squad not found');
  return result.rows[0];
}

async function getMembers(squadId) {
  return query(`SELECT * FROM squad_memberships WHERE squad_id = $1 ORDER BY joined_at, id`, [required(squadId, 'squadId')]);
}

async function getDailyEligibility({ squadId, date = new Date() }) {
  required(squadId, 'squadId');
  return withTransaction(async client => {
    await refreshMembershipStatuses(client, squadId, date);
    const minMembers = await settingNumber(client, 'squad.daily_min_active_members', 0);
    const threshold = await settingNumber(client, 'squad.daily_activity_threshold_percent', 80);
    const bonusRate = await settingNumber(client, 'squad.daily_bonus_rate', 0);
    if (minMembers < 0 || threshold < 0 || threshold > 100 || bonusRate < 0) throw new Error('Invalid Squad daily settings');
    const counts = await client.query(`SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active_member_count, COUNT(*) FILTER (WHERE status = 'active' AND EXISTS (SELECT 1 FROM squad_activity_events e WHERE e.squad_id = m.squad_id AND e.user_id = m.user_id AND e.occurred_at >= $2::date AND e.occurred_at < ($2::date + INTERVAL '1 day')))::int AS active_today_count FROM squad_memberships m WHERE m.squad_id = $1 AND m.status IN ('active','inactive')`, [squadId, date]);
    const activeMembers = Number(counts.rows[0].active_member_count);
    const activeToday = Number(counts.rows[0].active_today_count);
    const activityPercent = activeMembers ? (activeToday / activeMembers) * 100 : 0;
    const qualified = activeMembers >= minMembers && activeMembers > 0 && activityPercent >= threshold;
    const bonusDate = new Date(date).toISOString().slice(0, 10);
    const saved = await client.query(`INSERT INTO squad_daily_bonus_days (squad_id,bonus_date,qualified,active_member_count,active_today_count,activity_percent,bonus_rate) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (squad_id,bonus_date) DO UPDATE SET qualified=EXCLUDED.qualified, active_member_count=EXCLUDED.active_member_count, active_today_count=EXCLUDED.active_today_count, activity_percent=EXCLUDED.activity_percent, bonus_rate=EXCLUDED.bonus_rate, calculated_at=NOW() RETURNING *`, [squadId, bonusDate, qualified, activeMembers, activeToday, activityPercent, qualified ? bonusRate : 0]);
    return { snapshot: saved.rows[0], nextDayBonusActive: qualified, explanation: { activeMembers, activeToday, activityPercent, threshold, minMembers, bonusRate } };
  });
}

async function getApplicableModifier({ userId, date = new Date() }) {
  const result = await query(`SELECT m.squad_id, b.bonus_date, b.bonus_rate FROM squad_memberships m JOIN squad_daily_bonus_days b ON b.squad_id = m.squad_id WHERE m.user_id = $1 AND m.status = 'active' AND b.bonus_date = ($2::date - INTERVAL '1 day')::date AND b.qualified = TRUE`, [userId, date]);
  if (!result.rowCount) return { type: 'squad', rate: 0, eligible: false };
  return { type: 'squad', rate: Number(result.rows[0].bonus_rate), eligible: true, squadId: result.rows[0].squad_id, sourceDate: result.rows[0].bonus_date };
}

async function createGoal({ squadId, title, description = null, targetType, targetQuantity, rewardPool, startsAt = new Date(), expiresAt = null, status = 'active' }) {
  required(squadId, 'squadId'); required(title, 'title'); required(targetType, 'targetType');
  const target = positiveNumber(targetQuantity, 'targetQuantity');
  const pool = positiveNumber(rewardPool, 'rewardPool');
  return withTransaction(async client => {
    const result = await client.query(`INSERT INTO squad_goals (squad_id,title,description,target_type,target_quantity,reward_currency,reward_pool,starts_at,expires_at,status) VALUES ($1,$2,$3,$4,$5,'DZX',$6,$7,$8,$9) RETURNING *`, [squadId, title, description, targetType, target, pool, startsAt, expiresAt, status]);
    return result.rows[0];
  });
}

async function recordGoalContribution({ goalId, activityEventId, userId, quantity }) {
  const amount = positiveNumber(quantity, 'quantity');
  return withTransaction(async client => {
    const goalResult = await client.query('SELECT * FROM squad_goals WHERE id = $1 FOR UPDATE', [required(goalId, 'goalId')]);
    if (!goalResult.rowCount) throw new Error('Goal not found');
    const goal = goalResult.rows[0];
    if (goal.status !== 'active') throw new Error('Goal is not active');
    const eventResult = await client.query(`SELECT * FROM squad_activity_events WHERE id = $1 AND user_id = $2 AND squad_id = $3 FOR SHARE`, [required(activityEventId, 'activityEventId'), userId, goal.squad_id]);
    if (!eventResult.rowCount) throw new Error('Activity event does not belong to this Squad/user');
    const event = eventResult.rows[0];
    if (event.occurred_at < goal.starts_at || (goal.expires_at && event.occurred_at >= goal.expires_at)) throw new Error('Activity event is outside the Goal window');
    const existing = await client.query('SELECT * FROM squad_goal_contributions WHERE goal_id = $1 AND activity_event_id = $2', [goalId, activityEventId]);
    if (existing.rowCount) return { contribution: existing.rows[0], duplicate: true };
    const contribution = await client.query(`INSERT INTO squad_goal_contributions (goal_id,user_id,activity_event_id,contribution_quantity,weight) VALUES ($1,$2,$3,$4,$4) RETURNING *`, [goalId, userId, activityEventId, amount]);
    return { contribution: contribution.rows[0], duplicate: false };
  });
}

async function getGoalProgress(goalId) {
  const result = await query(`SELECT g.*, COALESCE(SUM(c.contribution_quantity),0) AS progress, COUNT(DISTINCT c.user_id)::int AS contributor_count FROM squad_goals g LEFT JOIN squad_goal_contributions c ON c.goal_id = g.id WHERE g.id = $1 GROUP BY g.id`, [required(goalId, 'goalId')]);
  if (!result.rowCount) throw new Error('Goal not found');
  const row = result.rows[0];
  const progress = Number(row.progress);
  return { goal: row, progress, contributorCount: Number(row.contributor_count), completed: progress >= Number(row.target_quantity) };
}

async function calculateGoalDistribution(goalId) {
  return withTransaction(async client => {
    const goalResult = await client.query('SELECT * FROM squad_goals WHERE id = $1 FOR UPDATE', [required(goalId, 'goalId')]);
    if (!goalResult.rowCount) throw new Error('Goal not found');
    const goal = goalResult.rows[0];
    const contributions = await client.query('SELECT user_id, SUM(weight) AS weight FROM squad_goal_contributions WHERE goal_id = $1 GROUP BY user_id ORDER BY user_id', [goalId]);
    if (!contributions.rowCount) throw new Error('Goal has no contributors');
    const totalWeight = contributions.rows.reduce((sum, row) => sum + Number(row.weight), 0);
    if (totalWeight <= 0) throw new Error('Goal total weight must be positive');
    const pool = Number(goal.reward_pool);
    const distributions = contributions.rows.map(row => {
      const weight = Number(row.weight);
      const reward = pool * weight / totalWeight;
      return { userId: row.user_id, weight, totalWeight, rewardAmount: reward, calculation: { formula: 'reward_pool * member_weight / total_weight', reward_pool: pool, member_weight: weight, total_weight: totalWeight } };
    });
    return { goal, distributions };
  });
}

async function snapshotGoalDistribution(goalId) {
  const calculated = await calculateGoalDistribution(goalId);
  return withTransaction(async client => {
    const goal = await client.query('SELECT * FROM squad_goals WHERE id = $1 FOR UPDATE', [goalId]);
    if (!goal.rowCount) throw new Error('Goal not found');
    if (goal.rows[0].status === 'cancelled' || goal.rows[0].status === 'expired') throw new Error('Goal cannot be rewarded');
    const progress = await client.query('SELECT COALESCE(SUM(contribution_quantity),0) AS progress FROM squad_goal_contributions WHERE goal_id = $1', [goalId]);
    if (Number(progress.rows[0].progress) < Number(goal.rows[0].target_quantity)) throw new Error('Goal target has not been reached');
    const existing = await client.query('SELECT COUNT(*)::int AS count FROM squad_goal_distributions WHERE goal_id = $1', [goalId]);
    if (Number(existing.rows[0].count) > 0) {
      const rows = await client.query('SELECT * FROM squad_goal_distributions WHERE goal_id = $1 ORDER BY user_id', [goalId]);
      return { goal: goal.rows[0], distributions: rows.rows, duplicate: true };
    }
    const inserted = [];
    for (const item of calculated.distributions) {
      const result = await client.query(`INSERT INTO squad_goal_distributions (goal_id,user_id,weight,total_weight,reward_amount,calculation,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [goalId, item.userId, item.weight, item.totalWeight, item.rewardAmount, item.calculation, `squad-goal:${goalId}:user:${item.userId}`]);
      inserted.push(result.rows[0]);
    }
    await client.query(`UPDATE squad_goals SET status='rewarded', completed_at=COALESCE(completed_at,NOW()), rewarded_at=NOW(), updated_at=NOW() WHERE id=$1`, [goalId]);
    return { goal: { ...goal.rows[0], status: 'rewarded' }, distributions: inserted, duplicate: false };
  });
}

module.exports = { createSquad, addMember, recordQualifyingActivity, getSquad, getMembers, refreshMembershipStatuses, getDailyEligibility, getApplicableModifier, createGoal, recordGoalContribution, getGoalProgress, calculateGoalDistribution, snapshotGoalDistribution };
