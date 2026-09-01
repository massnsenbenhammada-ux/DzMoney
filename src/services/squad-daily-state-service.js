const { query, withTransaction } = require('../db/pool');

const DEFAULT_TARGET_PER_MEMBER = 10;
const DEFAULT_VERIFIED_AD_TARGET = 10;
const UTC_PLUS_ONE = 'Etc/GMT-1';

function dayDate(value = null) {
  if (value) {
    const text = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('day must be YYYY-MM-DD');
    return text;
  }
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

function nextDay(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid daily state date');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function ensureDailyState(client, squadId, day) {
  const existing = await client.query('SELECT * FROM squad_daily_states WHERE squad_id=$1 AND day_date=$2 FOR UPDATE', [squadId, day]);
  if (existing.rowCount) return existing.rows[0];
  const targetPerMember = await settingNumber(client, 'squad.daily_target_dzp_per_member', DEFAULT_TARGET_PER_MEMBER);
  const inserted = await client.query(
    `INSERT INTO squad_daily_states(squad_id,day_date,eligible_member_count,daily_target)
     SELECT $1,$2,COUNT(*)::int,COUNT(*)::numeric * $3::numeric
     FROM squad_memberships
     WHERE squad_id=$1 AND status IN ('active','inactive')
     RETURNING *`,
    [squadId, day, targetPerMember]
  );
  return inserted.rows[0];
}

async function activityMetrics(client, squadId, day) {
  const result = await client.query(
    `WITH verified_users AS (
       SELECT DISTINCT ta.user_id
       FROM task_attempts ta
       JOIN squad_memberships sm ON sm.user_id=ta.user_id AND sm.squad_id=$1 AND sm.status IN ('active','inactive')
       WHERE ta.status='verified'
         AND (ta.verified_at AT TIME ZONE '${UTC_PLUS_ONE}')::date=$2
       UNION
       SELECT DISTINCT a.user_id
       FROM activity_ad_events a
       JOIN squad_memberships sm ON sm.user_id=a.user_id AND sm.squad_id=$1 AND sm.status IN ('active','inactive')
       WHERE a.verified=TRUE
         AND (COALESCE(a.completed_at,a.started_at) AT TIME ZONE '${UTC_PLUS_ONE}')::date=$2
     ),
     dzp AS (
       SELECT COALESCE(SUM(le.amount),0) AS contribution
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt.id=le.transaction_id
       JOIN squad_memberships sm ON sm.user_id=lt.user_id AND sm.squad_id=$1 AND sm.status IN ('active','inactive')
       WHERE le.currency='DZP'
         AND le.amount > 0
         AND le.source IN ('task','advertisement')
         AND lt.transaction_type='REWARD'
         AND (lt.created_at AT TIME ZONE '${UTC_PLUS_ONE}')::date=$2
     )
     SELECT (SELECT COUNT(*)::int FROM verified_users) AS active_member_count,
            (SELECT contribution FROM dzp) AS dzp_contribution`,
    [squadId, day]
  );
  return result.rows[0];
}

async function getDailySquadState({ squadId, day = null }) {
  if (!squadId) throw new Error('squadId is required');
  const selectedDay = dayDate(day);
  return withTransaction(async client => {
    const squad = await client.query('SELECT id FROM squads WHERE id=$1', [squadId]);
    if (!squad.rowCount) throw new Error('Squad not found');
    const state = await ensureDailyState(client, squadId, selectedDay);
    const metrics = await activityMetrics(client, squadId, selectedDay);
    const activeMemberCount = Number(metrics.active_member_count || 0);
    const dzpContribution = String(metrics.dzp_contribution || '0');
    const targetReached = Number(dzpContribution) >= Number(state.daily_target);
    const activityReached = state.eligible_member_count > 0 && activeMemberCount * 2 >= state.eligible_member_count;
    const active = targetReached || activityReached;
    const activationReason = targetReached && activityReached ? 'both' : targetReached ? 'target' : activityReached ? 'activity' : null;
    const updated = await client.query(
      `UPDATE squad_daily_states
       SET active_member_count=$1,dzp_contribution=$2,status=$3,activation_reason=$4,evaluated_at=NOW()
       WHERE id=$5
       RETURNING *`,
      [activeMemberCount, dzpContribution, active ? 'active' : 'risk', activationReason, state.id]
    );
    const row = updated.rows[0];
    return {
      squadId: String(row.squad_id),
      day: row.day_date,
      effectiveForDate: nextDay(row.day_date),
      eligibleMemberCount: row.eligible_member_count,
      dailyTarget: String(row.daily_target),
      activeMemberCount: row.active_member_count,
      dzpContribution: String(row.dzp_contribution),
      status: row.status,
      activationReason: row.activation_reason,
      verifiedAdTarget: await settingNumber(client, 'squad.daily_verified_ad_target', DEFAULT_VERIFIED_AD_TARGET),
      evaluatedAt: row.evaluated_at
    };
  });
}

async function getCurrentUserSquadState({ userId, day = null }) {
  if (!userId) throw new Error('userId is required');
  const result = await query(`SELECT squad_id FROM squad_memberships WHERE user_id=$1 AND status IN ('active','inactive')`, [userId]);
  if (!result.rowCount) return null;
  return getDailySquadState({ squadId: result.rows[0].squad_id, day });
}

module.exports = { getDailySquadState, getCurrentUserSquadState, dayDate };
