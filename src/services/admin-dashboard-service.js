const { query } = require('../db/pool');

const UTC_PLUS_ONE = 'Etc/GMT-1';

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
       ) ORDER BY day) FROM series) AS seven_day`,
    [new Date(now)]
  );

  const row = result.rows[0];
  return {
    realtime: row.realtime,
    sevenDay: row.seven_day,
  };
}

module.exports = { getAdminDashboardMetrics };
