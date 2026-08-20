"use strict";

const express = require("express");
const { Pool } = require("pg");

// Live, authoritative Admin Dashboard API. The existing admin authentication
// handler remains the first middleware for /api/admin/stats.
const originalGet = express.application.get;
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

function dayStartUtc(daysAgo = 0) {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo);
}

function dayLabels() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayStartUtc(6 - i));
    return d.toISOString().slice(0, 10);
  });
}

async function dashboardHandler(req, res) {
  try {
    const todayStart = dayStartUtc(0);
    const tomorrowStart = dayStartUtc(-1);
    const sevenDaysStart = dayStartUtc(6);

    const [
      users,
      newUsersToday,
      adsToday,
      adsTotal,
      tasksToday,
      tasksTotal,
      dzpTotal,
      dzxTotal,
      coinsTotal,
      dailyUsers,
      dailyAds,
      dailyTasks,
      topActive,
      topReferrers,
      poolDistributed
    ] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE created_at >= $1 AND created_at < $2", [todayStart, tomorrowStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM adsgram_ad_views WHERE status='confirmed' AND confirmed_at >= $1 AND confirmed_at < $2", [todayStart, tomorrowStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM adsgram_ad_views WHERE status='confirmed'"),
      pool.query("SELECT COUNT(*)::int AS count FROM task_claims WHERE claimed_at >= $1 AND claimed_at < $2 AND claimed_at > 0", [todayStart, tomorrowStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM task_claims WHERE claimed_at > 0"),
      pool.query("SELECT COALESCE(SUM(dzp),0)::numeric AS total FROM users"),
      pool.query("SELECT COALESCE(SUM(dzx),0)::numeric AS total FROM users"),
      pool.query("SELECT COALESCE(SUM(coins),0)::numeric AS total FROM users"),
      pool.query("SELECT to_char(to_timestamp(created_at/1000.0),'YYYY-MM-DD') AS day, COUNT(*)::int AS value FROM users WHERE created_at >= $1 GROUP BY 1 ORDER BY 1", [sevenDaysStart]),
      pool.query("SELECT to_char(to_timestamp(confirmed_at/1000.0),'YYYY-MM-DD') AS day, COUNT(*)::int AS value FROM adsgram_ad_views WHERE status='confirmed' AND confirmed_at >= $1 GROUP BY 1 ORDER BY 1", [sevenDaysStart]),
      pool.query("SELECT to_char(to_timestamp(claimed_at/1000.0),'YYYY-MM-DD') AS day, COUNT(*)::int AS value FROM task_claims WHERE claimed_at > 0 AND claimed_at >= $1 GROUP BY 1 ORDER BY 1", [sevenDaysStart]),
      pool.query(`
        WITH task_counts AS (
          SELECT user_id, COUNT(*)::int AS task_count
          FROM task_claims
          WHERE claimed_at > 0 AND claimed_at >= $1
          GROUP BY user_id
        ), ad_counts AS (
          SELECT user_id, COUNT(*)::int AS ad_count
          FROM adsgram_ad_views
          WHERE status='confirmed' AND confirmed_at >= $1
          GROUP BY user_id
        )
        SELECT u.id,
               COALESCE(u.username,'') AS username,
               COALESCE(u.first_name,'') AS first_name,
               COALESCE(t.task_count,0)::int AS tasks,
               COALESCE(a.ad_count,0)::int AS ads,
               (COALESCE(t.task_count,0) + COALESCE(a.ad_count,0))::int AS activity
        FROM users u
        LEFT JOIN task_counts t ON t.user_id=u.id
        LEFT JOIN ad_counts a ON a.user_id=u.id
        WHERE COALESCE(t.task_count,0) + COALESCE(a.ad_count,0) > 0
        ORDER BY activity DESC, u.created_at ASC
        LIMIT 10
      `, [sevenDaysStart]),
      pool.query(`
        SELECT u.id,
               COALESCE(u.username,'') AS username,
               COALESCE(u.first_name,'') AS first_name,
               COUNT(r.id)::int AS referrals,
               COUNT(r.referral_qualified_at)::int AS qualified
        FROM users u
        LEFT JOIN users r ON r.referred_by=u.id
        GROUP BY u.id, u.username, u.first_name
        HAVING COUNT(r.id) > 0
        ORDER BY referrals DESC, qualified DESC
        LIMIT 10
      `),
      pool.query("SELECT COALESCE(SUM(amount),0)::numeric AS total FROM economy_ledger WHERE asset='DZP' AND direction='CREDIT' AND source_type IN ('REWARDS_POOL','POOL_DISTRIBUTION')")
    ]);

    const labels = dayLabels();
    const fill = result => {
      const map = Object.fromEntries(result.rows.map(row => [row.day, Number(row.value)]));
      return labels.map(day => ({ day, value: map[day] || 0 }));
    };

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json({
      success: true,
      live: true,
      generatedAt: Date.now(),
      metrics: {
        members: Number(users.rows[0].count),
        newMembersToday: Number(newUsersToday.rows[0].count),
        adsWatched: Number(adsTotal.rows[0].count),
        adsWatchedToday: Number(adsToday.rows[0].count),
        tasksCompleted: Number(tasksTotal.rows[0].count),
        tasksCompletedToday: Number(tasksToday.rows[0].count),
        totalDZP: Number(dzpTotal.rows[0].total),
        totalDZX: Number(dzxTotal.rows[0].total),
        totalCoins: Number(coinsTotal.rows[0].total),
        rewardsPoolDistributedDZP: Number(poolDistributed.rows[0].total)
      },
      charts: {
        members: fill(dailyUsers),
        ads: fill(dailyAds),
        tasks: fill(dailyTasks)
      },
      topActive: topActive.rows.map(row => ({
        id: row.id,
        username: row.username,
        firstName: row.first_name,
        tasks: Number(row.tasks),
        ads: Number(row.ads),
        activity: Number(row.activity)
      })),
      topReferrers: topReferrers.rows.map(row => ({
        id: row.id,
        username: row.username,
        firstName: row.first_name,
        referrals: Number(row.referrals),
        qualified: Number(row.qualified)
      }))
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({ success: false, message: "Unable to load live dashboard." });
  }
}

express.application.get = function(pathname, ...handlers) {
  if (pathname === "/api/admin/stats" && handlers.length >= 1) {
    return originalGet.call(this, pathname, handlers[0], dashboardHandler);
  }
  return originalGet.call(this, pathname, ...handlers);
};

process.on("exit", () => { if (pool) pool.end().catch(() => {}); });
