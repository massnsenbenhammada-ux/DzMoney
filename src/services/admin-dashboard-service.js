const { query } = require("../db/pool");

const UTC_PLUS_ONE = "Etc/GMT-1";

async function getAdminDashboardMetrics({ now = new Date() } = {}) {
  const result = await query(
    `WITH params AS (
       SELECT (($1::timestamptz AT TIME ZONE '${UTC_PLUS_ONE}')::date) AS today
     ),
     days AS (
       SELECT generate_series(today - 6, today, INTERVAL '1 day')::date AS day
       FROM params
     ),
     members AS (
       SELECT d.day, COUNT(u.id)::int AS total_members
       FROM days d
       LEFT JOIN users u
         ON (u.created_at AT TIME ZONE '${UTC_PLUS_ONE}')::date <= d.day
       GROUP BY d.day
     ),
     ads AS (
       SELECT (a.completed_at AT TIME ZONE '${UTC_PLUS_ONE}')::date AS day, COUNT(*)::int AS advertisements_watched
       FROM activity_ad_events a
       CROSS JOIN params p
       WHERE a.verified = TRUE
         AND a.completed_at IS NOT NULL
         AND (a.completed_at AT TIME ZONE '${UTC_PLUS_ONE}')::date BETWEEN p.today - 6 AND p.today
       GROUP BY 1
     ),
     tasks AS (
       SELECT (t.verified_at AT TIME ZONE '${UTC_PLUS_ONE}')::date AS day, COUNT(*)::int AS tasks_completed
       FROM task_attempts t
       CROSS JOIN params p
       WHERE t.status = 'verified'
         AND t.verified_at IS NOT NULL
         AND (t.verified_at AT TIME ZONE '${UTC_PLUS_ONE}')::date BETWEEN p.today - 6 AND p.today
       GROUP BY 1
     ),
     series AS (
       SELECT d.day,
              m.total_members,
              COALESCE(a.advertisements_watched, 0) AS advertisements_watched,
              COALESCE(t.tasks_completed, 0) AS tasks_completed
       FROM days d
       JOIN members m ON m.day = d.day
       LEFT JOIN ads a ON a.day = d.day
       LEFT JOIN tasks t ON t.day = d.day
       ORDER BY d.day
     ),
     realtime AS (
       SELECT
         (SELECT COUNT(*)::int FROM users) AS total_members,
         (SELECT COUNT(*)::int FROM activity_ad_events WHERE verified = TRUE) AS advertisements_watched,
         (SELECT COUNT(*)::int FROM task_attempts WHERE status = 'verified') AS tasks_completed
     ),
     member_activity AS (
       SELECT a.user_id, COUNT(*)::int AS activity_count
       FROM activity_ad_events a
       WHERE a.verified = TRUE
       GROUP BY a.user_id
       UNION ALL
       SELECT t.user_id, COUNT(*)::int AS activity_count
       FROM task_attempts t
       WHERE t.status = 'verified'
       GROUP BY t.user_id
     ),
     active_members AS (
       SELECT u.id, u.telegram_user_id, u.username, u.first_name,
              COALESCE(SUM(ma.activity_count), 0)::int AS activity_count
       FROM users u
       LEFT JOIN member_activity ma ON ma.user_id = u.id
       GROUP BY u.id, u.telegram_user_id, u.username, u.first_name
       ORDER BY activity_count DESC, u.id ASC
       LIMIT 10
     ),
     top_referrers AS (
       SELECT u.id, u.telegram_user_id, u.username, u.first_name,
              COUNT(r.id)::int AS referral_count
       FROM users u
       JOIN referral_attributions r
         ON r.referrer_user_id = u.id
        AND r.status = 'qualified'
       GROUP BY u.id, u.telegram_user_id, u.username, u.first_name
       ORDER BY referral_count DESC, u.id ASC
       LIMIT 10
     )
     SELECT
       (SELECT json_build_object(
         'totalMembers', total_members,
         'advertisementsWatched', advertisements_watched,
         'tasksCompleted', tasks_completed
       ) FROM realtime) AS realtime,
       (SELECT json_agg(json_build_object(
         'date', day,
         'totalMembers', total_members,
         'advertisementsWatched', advertisements_watched,
         'tasksCompleted', tasks_completed
       ) ORDER BY day) FROM series) AS seven_day,
       (SELECT COALESCE(json_agg(json_build_object(
         'telegramUserId', telegram_user_id,
         'username', username,
         'firstName', first_name,
         'activityCount', activity_count
       ) ORDER BY activity_count DESC, id ASC), '[]'::json) FROM active_members) AS top_active_members,
       (SELECT COALESCE(json_agg(json_build_object(
         'telegramUserId', telegram_user_id,
         'username', username,
         'firstName', first_name,
         'referralCount', referral_count
       ) ORDER BY referral_count DESC, id ASC), '[]'::json) FROM top_referrers) AS top_referrers`,
    [new Date(now)],
  );

  const row = result.rows[0];
  return {
    realtime: row.realtime,
    sevenDay: row.seven_day,
    topActiveMembers: row.top_active_members,
    topReferrers: row.top_referrers,
  };
}

module.exports = { getAdminDashboardMetrics };
