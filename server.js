const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_TASKS = [
  {
    id: "video",
    title: "Watch a video",
    description: "Watch the video and earn 10 BUX",
    reward: 10,
    type: "timer",
    duration: 15,
    icon: "📺",
    repeatable: false,
    cooldown: 0
  },
  {
    id: "website",
    title: "Visit a website",
    description: "Visit the website and earn 25 BUX",
    reward: 25,
    type: "timer",
    duration: 10,
    icon: "🌐",
    repeatable: false,
    cooldown: 0
  },
  {
    id: "daily",
    title: "Daily activity",
    description: "Complete today's activity and earn 50 BUX",
    reward: 50,
    type: "timer",
    duration: 20,
    icon: "⭐",
    repeatable: true,
    cooldown: 86400
  },
  {
    id: "special",
    title: "Special task",
    description: "Complete the special task and earn 100 BUX",
    reward: 100,
    type: "timer",
    duration: 30,
    icon: "🎁",
    repeatable: false,
    cooldown: 0
  }
];

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      coins BIGINT NOT NULL DEFAULT 0,
      bux BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      daily_claim_at BIGINT NOT NULL DEFAULT 0,
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      username TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      referral_earnings_bux BIGINT NOT NULL DEFAULT 0,
      referral_earnings_coins BIGINT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reward BIGINT NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'timer',
      duration INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT '🎯',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      repeatable BOOLEAN NOT NULL DEFAULT FALSE,
      cooldown_seconds INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_claims (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      claimed_at BIGINT NOT NULL,
      reward BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
    ON admin_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS withdrawals (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_bux BIGINT NOT NULL CHECK (amount_bux > 0),
      fee_bux BIGINT NOT NULL DEFAULT 0,
      net_bux BIGINT NOT NULL DEFAULT 0,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      processed_at BIGINT
    );
  `);

  // Safe schema upgrades for existing databases.
  // This also repairs older users tables that predate the current schema.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bux BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_claim_at BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_bux BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_coins BIGINT NOT NULL DEFAULT 0;
  `);

  // Normalize any legacy NULL values before the application reads them.
  await pool.query(`
    UPDATE users
    SET
      coins = COALESCE(coins, 0),
      bux = COALESCE(bux, 0),
      created_at = COALESCE(created_at, 0),
      daily_claim_at = COALESCE(daily_claim_at, 0),
      is_banned = COALESCE(is_banned, FALSE),
      username = COALESCE(username, ''),
      first_name = COALESCE(first_name, ''),
      last_name = COALESCE(last_name, ''),
      referral_earnings_bux = COALESCE(referral_earnings_bux, 0),
      referral_earnings_coins = COALESCE(referral_earnings_coins, 0)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uq
    ON users(referral_code) WHERE referral_code IS NOT NULL;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_referred_by_fkey
        FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  const settings = {
    daily_reward_coins: "1000",
    daily_reward_bux: "1",
    coins_per_bux: "1000",
    bux_per_ton: "10000",
    minimum_withdraw_bux: "2000",
    withdrawal_fee_bux: "0",
    daily_ads_limit: "20",
    daily_reward_ad_separate: "true",
    referral_percentage: "12",
    system_enabled: "true"
  };

  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (key) DO NOTHING`,
      [key, value, Date.now()]
    );
  }

  for (const task of DEFAULT_TASKS) {
    await pool.query(
      `INSERT INTO tasks
       (id,title,description,reward,type,duration,icon,active,
        repeatable,cooldown_seconds,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$10)
       ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        task.title,
        task.description,
        task.reward,
        task.type,
        task.duration,
        task.icon,
        task.repeatable,
        task.cooldown,
        Date.now()
      ]
    );
  }
}

function loadLegacyData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { users: {}, taskClaims: {} };
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Could not read legacy data.json:", error);
    return { users: {}, taskClaims: {} };
  }
}

async function migrateLegacyData() {
  const legacy = loadLegacyData();

  for (const [id, user] of Object.entries(legacy.users || {})) {
    await pool.query(
      `INSERT INTO users
       (id,coins,bux,created_at,daily_claim_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [
        String(id),
        Number(user.coins) || 0,
        Number(user.bux) || 0,
        Number(user.createdAt) || Date.now(),
        Number(user.dailyClaimAt) || 0
      ]
    );
  }

  for (const [userId, claims] of Object.entries(legacy.taskClaims || {})) {
    for (const [taskId, claim] of Object.entries(claims || {})) {
      await pool.query(
        `INSERT INTO task_claims
         (user_id,task_id,claimed_at,reward)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id,task_id) DO NOTHING`,
        [
          String(userId),
          taskId,
          Number(claim.claimedAt) || Date.now(),
          Number(claim.reward) || 0
        ]
      );
    }
  }
}

function getTelegramUser(req) {
  const raw = req.body?.telegramUser ?? req.query?.telegramUser;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function getUserId(req) {
  const telegramUser = getTelegramUser(req);
  if (telegramUser?.id) return String(telegramUser.id);
  return "demo-user";
}

function makeReferralCode(id) {
  return crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 10).toUpperCase();
}

async function getUser(id, telegramUser = null) {
  const result = await pool.query("SELECT * FROM users WHERE id=$1", [id]);

  if (result.rowCount) {
    let user = result.rows[0];

    if (telegramUser && user.id !== "demo-user") {
      const updated = await pool.query(
        `UPDATE users
         SET username=$1, first_name=$2, last_name=$3,
             referral_code=COALESCE(referral_code,$4)
         WHERE id=$5
         RETURNING *`,
        [
          String(telegramUser.username || ""),
          String(telegramUser.first_name || ""),
          String(telegramUser.last_name || ""),
          makeReferralCode(user.id),
          user.id
        ]
      );
      return updated.rows[0];
    }

    if (!user.referral_code) {
      const updated = await pool.query(
        `UPDATE users SET referral_code=$1 WHERE id=$2 RETURNING *`,
        [makeReferralCode(user.id), user.id]
      );
      return updated.rows[0];
    }

    return user;
  }

  const created = await pool.query(
    `INSERT INTO users
     (id,coins,bux,created_at,daily_claim_at,username,first_name,last_name,referral_code)
     VALUES ($1,0,0,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      id, Date.now(), 0,
      String(telegramUser?.username || ""),
      String(telegramUser?.first_name || ""),
      String(telegramUser?.last_name || ""),
      makeReferralCode(id)
    ]
  );

  return created.rows[0];
}

function formatUser(user) {
  return {
    id: user.id,
    createdAt: Number(user.created_at) || 0,
    coins: Number(user.coins),
    bux: Number(user.bux),
    ton: Number(user.bux) / 10000,
    dailyClaimAt: Number(user.daily_claim_at) || 0,
    isBanned: Boolean(user.is_banned),
    username: user.username || "",
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    referralCode: user.referral_code || makeReferralCode(user.id),
    referredBy: user.referred_by || "",
    referralEarningsBux: Number(user.referral_earnings_bux) || 0,
    referralEarningsCoins: Number(user.referral_earnings_coins) || 0
  };
}

function cooldownActive(claimedAt, seconds) {
  return (
    claimedAt &&
    seconds > 0 &&
    Date.now() - Number(claimedAt) < seconds * 1000
  );
}


// ============================
// Admin authentication
// ============================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;

function getAdminToken(req) {
  const cookieHeader = req.headers.cookie || "";

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("dz_admin=")) {
      return trimmed.slice("dz_admin=".length);
    }
  }

  return "";
}

async function cleanupAdminSessions() {
  await pool.query(
    "DELETE FROM admin_sessions WHERE expires_at <= $1",
    [Date.now()]
  );
}

async function getAdminSession(req) {
  const token = getAdminToken(req);
  if (!token) return null;

  const result = await pool.query(
    `SELECT token, admin_id, created_at, expires_at
     FROM admin_sessions
     WHERE token=$1 AND expires_at>$2
     LIMIT 1`,
    [token, Date.now()]
  );

  if (!result.rowCount) return null;

  const session = result.rows[0];

  return {
    token: session.token,
    adminId: session.admin_id,
    createdAt: Number(session.created_at),
    expiresAt: Number(session.expires_at)
  };
}

async function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      success: false,
      message: "Admin panel is disabled. Set ADMIN_PASSWORD in Railway Variables."
    });
  }

  try {
    const session = await getAdminSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required."
      });
    }

    req.admin = session;
    next();
  } catch (error) {
    console.error("Admin authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to verify admin session."
    });
  }
}

async function audit(adminId, action, targetId = "", details = "") {
  await pool.query(
    `INSERT INTO admin_audit
     (admin_id, action, target_id, details, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [adminId, action, targetId || null, details, Date.now()]
  );
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function isSystemEnabled() {
  const result = await pool.query(
    "SELECT value FROM settings WHERE key='system_enabled' LIMIT 1"
  );
  return result.rowCount ? String(result.rows[0].value).toLowerCase() === "true" : true;
}

async function requireSystemEnabled(req, res, next) {
  try {
    if (!(await isSystemEnabled())) {
      return res.status(503).json({
        success: false,
        code: "SYSTEM_PAUSED",
        message: "DzMoney is temporarily paused by the administrator."
      });
    }
    next();
  } catch (error) {
    console.error("System status check error:", error);
    res.status(500).json({ success: false, message: "Unable to check system status." });
  }
}

async function creditReferral(client, userId, earnedBux) {
  const percentage = Number(await getSettingValue("referral_percentage", "0"));
  if (!Number.isFinite(percentage) || percentage <= 0 || earnedBux <= 0) return;

  const result = await client.query(
    `SELECT referred_by FROM users WHERE id=$1`,
    [userId]
  );
  const sponsorId = result.rows[0]?.referred_by;
  if (!sponsorId || sponsorId === userId) return;

  const referralBux = Math.floor(Number(earnedBux) * percentage / 100);
  if (referralBux <= 0) return;

  const referralCoins = referralBux * 10;
  await client.query(
    `UPDATE users
     SET bux=bux+$1,
         coins=coins+$2,
         referral_earnings_bux=referral_earnings_bux+$1,
         referral_earnings_coins=referral_earnings_coins+$2
     WHERE id=$3`,
    [referralBux, referralCoins, sponsorId]
  );
}

async function getSettingValue(key, fallback = "") {
  const result = await pool.query(
    "SELECT value FROM settings WHERE key=$1 LIMIT 1",
    [key]
  );
  return result.rowCount ? String(result.rows[0].value) : fallback;
}

// ============================
// Admin API
// ============================

app.get("/admin", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/api/admin/login", async (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      success: false,
      message: "Set ADMIN_PASSWORD in Railway Variables first."
    });
  }

  const password = String(req.body?.password || "");

  const passwordOk =
    password.length === ADMIN_PASSWORD.length &&
    crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(ADMIN_PASSWORD)
    );

  if (!passwordOk) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin password."
    });
  }

  try {
    await cleanupAdminSessions();

    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + ADMIN_SESSION_TTL;

    await pool.query(
      `INSERT INTO admin_sessions (token, admin_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [token, "owner", now, expiresAt]
    );

    res.setHeader(
      "Set-Cookie",
      `dz_admin=${token}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}; Max-Age=${ADMIN_SESSION_TTL / 1000}`
    );

    res.json({
      success: true,
      admin: "owner"
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to create admin session."
    });
  }
});

app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM admin_sessions WHERE token=$1",
      [req.admin.token]
    );
  } catch (error) {
    console.error("Admin logout error:", error);
  }

  res.setHeader(
    "Set-Cookie",
    `dz_admin=; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}; Max-Age=0`
  );
  res.json({ success: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({
    success: true,
    admin: req.admin.adminId
  });
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [users, banned, bux, coins, tasks, claims, pendingWithdrawals, referrals, recent] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE is_banned=TRUE"),
      pool.query("SELECT COALESCE(SUM(bux),0)::bigint AS total FROM users"),
      pool.query("SELECT COALESCE(SUM(coins),0)::bigint AS total FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM tasks WHERE active=TRUE"),
      pool.query("SELECT COUNT(*)::int AS count FROM task_claims"),
      pool.query("SELECT COUNT(*)::int AS count FROM withdrawals WHERE status IN ('pending','approved')"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE referred_by IS NOT NULL"),
      pool.query(`
        SELECT admin_id, action, target_id, details, created_at
        FROM admin_audit
        ORDER BY created_at DESC
        LIMIT 20
      `)
    ]);

    res.json({
      success: true,
      stats: {
        users: users.rows[0].count,
        bannedUsers: banned.rows[0].count,
        totalBux: Number(bux.rows[0].total),
        totalCoins: Number(coins.rows[0].total),
        activeTasks: tasks.rows[0].count,
        totalClaims: claims.rows[0].count,
        pendingWithdrawals: pendingWithdrawals.rows[0].count,
        referrals: referrals.rows[0].count,
        systemEnabled: await isSystemEnabled()
      },
      recentActions: recent.rows
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load admin statistics."
    });
  }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);

    const result = q
      ? await pool.query(
          `SELECT id, coins, bux, created_at, daily_claim_at, is_banned
           FROM users
           WHERE id ILIKE $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [`%${q}%`, limit]
        )
      : await pool.query(
          `SELECT id, coins, bux, created_at, daily_claim_at, is_banned
           FROM users
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );

    res.json({
      success: true,
      users: result.rows.map(formatUser)
    });
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load users."
    });
  }
});

app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const userResult = await pool.query(
      "SELECT * FROM users WHERE id=$1",
      [req.params.id]
    );

    if (!userResult.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const user = userResult.rows[0];

    const claims = await pool.query(
      `SELECT c.task_id, c.claimed_at, c.reward, t.title
       FROM task_claims c
       LEFT JOIN tasks t ON t.id=c.task_id
       WHERE c.user_id=$1
       ORDER BY c.claimed_at DESC`,
      [req.params.id]
    );

    const referrals = await pool.query(
      `SELECT id,username,first_name,last_name,referral_code
       FROM users WHERE referred_by=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );

    res.json({
      success: true,
      user: formatUser(user),
      claims: claims.rows.map(row => ({
        taskId: row.task_id,
        title: row.title || row.task_id,
        claimedAt: Number(row.claimed_at),
        reward: Number(row.reward)
      })),
      referrals: referrals.rows.map(r => ({
        id: r.id,
        username: r.username || "",
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        referralCode: r.referral_code || ""
      }))
    });
  } catch (error) {
    console.error("Admin user details error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load user."
    });
  }
});

app.post("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const buxDelta = safeNumber(req.body?.buxDelta, 0);
  const coinsDelta = safeNumber(req.body?.coinsDelta, 0);

  if (!Number.isInteger(buxDelta) || !Number.isInteger(coinsDelta)) {
    return res.status(400).json({
      success: false,
      message: "BUX and Coins changes must be whole numbers."
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET bux=GREATEST(0,bux+$1),
           coins=GREATEST(0,coins+$2)
       WHERE id=$3
       RETURNING *`,
      [buxDelta, coinsDelta, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await audit(
      req.admin.adminId,
      "balance_change",
      userId,
      `buxDelta=${buxDelta};coinsDelta=${coinsDelta}`
    );

    res.json({
      success: true,
      user: formatUser(result.rows[0])
    });
  } catch (error) {
    console.error("Admin balance error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to change balance."
    });
  }
});


app.put("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const bux = safeNumber(req.body?.bux, NaN);
  const coins = safeNumber(req.body?.coins, NaN);

  if (!Number.isInteger(bux) || !Number.isInteger(coins) || bux < 0 || coins < 0) {
    return res.status(400).json({
      success: false,
      message: "BUX and Coins must be non-negative whole numbers."
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET bux=$1, coins=$2
       WHERE id=$3
       RETURNING *`,
      [bux, coins, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await audit(
      req.admin.adminId,
      "set_balance",
      userId,
      `bux=${bux};coins=${coins}`
    );

    res.json({
      success: true,
      user: formatUser(result.rows[0])
    });
  } catch (error) {
    console.error("Admin exact balance error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to set balance."
    });
  }
});

app.post("/api/admin/users/:id/reset-progress", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user = await client.query(
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      [userId]
    );

    if (!user.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await client.query(
      "DELETE FROM task_claims WHERE user_id=$1",
      [userId]
    );

    await client.query(
      "UPDATE users SET daily_claim_at=0 WHERE id=$1",
      [userId]
    );

    await client.query("COMMIT");

    await audit(
      req.admin.adminId,
      "reset_progress",
      userId,
      "task_claims_deleted;daily_reward_reset"
    );

    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin reset progress error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to reset user progress."
    });
  } finally {
    client.release();
  }
});

app.post("/api/admin/users/:id/reset-daily", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);

  try {
    const result = await pool.query(
      `UPDATE users
       SET daily_claim_at=0
       WHERE id=$1
       RETURNING *`,
      [userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await audit(
      req.admin.adminId,
      "reset_daily_reward",
      userId
    );

    res.json({
      success: true,
      user: formatUser(result.rows[0])
    });
  } catch (error) {
    console.error("Admin reset daily error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to reset daily reward."
    });
  }
});

app.post("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const banned = Boolean(req.body?.banned);

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_banned=$1
       WHERE id=$2
       RETURNING *`,
      [banned, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await audit(
      req.admin.adminId,
      banned ? "ban_user" : "unban_user",
      userId
    );

    res.json({
      success: true,
      user: formatUser(result.rows[0])
    });
  } catch (error) {
    console.error("Admin ban error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to update ban status."
    });
  }
});


// ============================
// Advanced Admin: user editing / deletion
// ============================

app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const username = String(req.body?.username ?? "").trim().slice(0, 64);
  const firstName = String(req.body?.firstName ?? "").trim().slice(0, 128);
  const lastName = String(req.body?.lastName ?? "").trim().slice(0, 128);
  const isBanned = Boolean(req.body?.isBanned);

  try {
    const result = await pool.query(
      `UPDATE users
       SET username=$1, first_name=$2, last_name=$3, is_banned=$4
       WHERE id=$5
       RETURNING *`,
      [username, firstName, lastName, isBanned, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await audit(
      req.admin.adminId,
      "edit_user",
      userId,
      `username=${username};firstName=${firstName};lastName=${lastName};isBanned=${isBanned}`
    );

    res.json({ success: true, user: formatUser(result.rows[0]) });
  } catch (error) {
    console.error("Admin edit user error:", error);
    res.status(500).json({ success: false, message: "Unable to edit user." });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);

  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id=$1 RETURNING id",
      [userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await audit(req.admin.adminId, "delete_user", userId, "user_and_related_records_deleted");
    res.json({ success: true, deletedUserId: userId });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ success: false, message: "Unable to delete user." });
  }
});

app.get("/api/admin/referrals", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const result = q
      ? await pool.query(
          `SELECT u.id,u.username,u.first_name,u.last_name,u.referral_code,u.referred_by,
                  u.referral_earnings_bux,u.referral_earnings_coins,
                  COALESCE(r.username,'') AS referrer_username,
                  COALESCE(r.first_name,'') AS referrer_first_name
           FROM users u
           LEFT JOIN users r ON r.id=u.referred_by
           WHERE u.id ILIKE $1 OR u.referral_code ILIKE $1 OR u.referred_by ILIKE $1
           ORDER BY u.created_at DESC LIMIT 100`,
          [`%${q}%`]
        )
      : await pool.query(
          `SELECT u.id,u.username,u.first_name,u.last_name,u.referral_code,u.referred_by,
                  u.referral_earnings_bux,u.referral_earnings_coins,
                  COALESCE(r.username,'') AS referrer_username,
                  COALESCE(r.first_name,'') AS referrer_first_name
           FROM users u
           LEFT JOIN users r ON r.id=u.referred_by
           WHERE u.referred_by IS NOT NULL
           ORDER BY u.created_at DESC LIMIT 100`
        );

    res.json({
      success: true,
      referrals: result.rows.map(r => ({
        id: r.id,
        username: r.username || "",
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        referralCode: r.referral_code || "",
        referredBy: r.referred_by || "",
        referrerName: [r.referrer_first_name, r.referrer_username ? "@" + r.referrer_username : ""]
          .filter(Boolean).join(" "),
        earningsBux: Number(r.referral_earnings_bux) || 0,
        earningsCoins: Number(r.referral_earnings_coins) || 0
      }))
    });
  } catch (error) {
    console.error("Admin referrals error:", error);
    res.status(500).json({ success: false, message: "Unable to load referrals." });
  }
});

app.put("/api/admin/users/:id/referral", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const referredByRaw = String(req.body?.referredBy || "").trim();
  const referredBy = referredByRaw || null;

  if (referredBy === userId) {
    return res.status(400).json({ success: false, message: "A user cannot refer themselves." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const user = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!user.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (referredBy) {
      const referrer = await client.query("SELECT id FROM users WHERE id=$1", [referredBy]);
      if (!referrer.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Referrer user not found." });
      }

      // Prevent simple referral cycles.
      let cursor = referredBy;
      for (let i = 0; i < 50 && cursor; i++) {
        if (cursor === userId) {
          await client.query("ROLLBACK");
          return res.status(400).json({ success: false, message: "Referral cycle detected." });
        }
        const next = await client.query("SELECT referred_by FROM users WHERE id=$1", [cursor]);
        cursor = next.rows[0]?.referred_by || null;
      }
    }

    const updated = await client.query(
      `UPDATE users SET referred_by=$1 WHERE id=$2 RETURNING *`,
      [referredBy, userId]
    );

    await client.query("COMMIT");
    await audit(req.admin.adminId, "set_referral", userId, `referredBy=${referredBy || ""}`);

    res.json({ success: true, user: formatUser(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin referral update error:", error);
    res.status(500).json({ success: false, message: "Unable to update referral." });
  } finally {
    client.release();
  }
});

app.put("/api/admin/users/:id/referral-earnings", requireAdmin, async (req, res) => {
  const userId = String(req.params.id);
  const bux = safeNumber(req.body?.bux, NaN);
  const coins = safeNumber(req.body?.coins, NaN);

  if (!Number.isInteger(bux) || !Number.isInteger(coins) || bux < 0 || coins < 0) {
    return res.status(400).json({ success: false, message: "Referral earnings must be non-negative whole numbers." });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET referral_earnings_bux=$1, referral_earnings_coins=$2
       WHERE id=$3 RETURNING *`,
      [bux, coins, userId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    await audit(req.admin.adminId, "set_referral_earnings", userId, `bux=${bux};coins=${coins}`);
    res.json({ success: true, user: formatUser(result.rows[0]) });
  } catch (error) {
    console.error("Admin referral earnings error:", error);
    res.status(500).json({ success: false, message: "Unable to update referral earnings." });
  }
});

// ============================
// System pause / resume
// ============================

app.get("/api/admin/system", requireAdmin, async (req, res) => {
  try {
    res.json({ success: true, enabled: await isSystemEnabled() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to read system status." });
  }
});

app.post("/api/admin/system", requireAdmin, async (req, res) => {
  const enabled = req.body?.enabled === true;

  try {
    await pool.query(
      `INSERT INTO settings (key,value,updated_at)
       VALUES ('system_enabled',$1,$2)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=$2`,
      [enabled ? "true" : "false", Date.now()]
    );

    await audit(
      req.admin.adminId,
      enabled ? "system_resume" : "system_pause",
      "",
      enabled ? "system_enabled" : "system_paused"
    );

    res.json({ success: true, enabled });
  } catch (error) {
    console.error("Admin system toggle error:", error);
    res.status(500).json({ success: false, message: "Unable to change system status." });
  }
});

// ============================
// Withdrawals
// ============================

app.post("/api/withdrawals", requireSystemEnabled, async (req, res) => {
  const client = await pool.connect();
  const userId = getUserId(req);
  const amount = safeNumber(req.body?.amountBux, NaN);
  const destination = String(req.body?.destination || "").trim().slice(0, 256);

  try {
    if (!Number.isInteger(amount) || amount <= 0 || !destination) {
      return res.status(400).json({ success: false, message: "Valid amount and destination are required." });
    }

    const minimum = Number(await getSettingValue("minimum_withdraw_bux", "2000"));
    const fee = Math.max(0, Number(await getSettingValue("withdrawal_fee_bux", "0")));

    if (amount < minimum) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal is ${minimum} BUX.` });
    }

    if (!Number.isInteger(fee) || fee >= amount) {
      return res.status(400).json({ success: false, message: "Withdrawal fee configuration is invalid." });
    }

    await client.query("BEGIN");
    const user = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!user.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (user.rows[0].is_banned) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "This account is banned." });
    }

    const pending = await client.query(
      `SELECT id FROM withdrawals
       WHERE user_id=$1 AND status IN ('pending','approved')
       LIMIT 1`,
      [userId]
    );
    if (pending.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "You already have a withdrawal in progress." });
    }

    if (Number(user.rows[0].bux) < amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Insufficient BUX." });
    }

    const net = amount - fee;
    const now = Date.now();

    await client.query(
      `UPDATE users SET bux=bux-$1 WHERE id=$2`,
      [amount, userId]
    );

    const created = await client.query(
      `INSERT INTO withdrawals
       (user_id,amount_bux,fee_bux,net_bux,destination,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$6)
       RETURNING *`,
      [userId, amount, fee, net, destination, now]
    );

    await client.query("COMMIT");
    res.json({
      success: true,
      withdrawal: {
        id: Number(created.rows[0].id),
        amountBux: amount,
        feeBux: fee,
        netBux: net,
        destination,
        status: "pending",
        createdAt: now
      }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Withdrawal request error:", error);
    res.status(500).json({ success: false, message: "Unable to create withdrawal." });
  } finally {
    client.release();
  }
});

app.get("/api/withdrawals", requireSystemEnabled, async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `SELECT id,amount_bux,fee_bux,net_bux,destination,status,admin_note,created_at,updated_at,processed_at
       FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    res.json({
      success: true,
      withdrawals: result.rows.map(w => ({
        id: Number(w.id),
        amountBux: Number(w.amount_bux),
        feeBux: Number(w.fee_bux),
        netBux: Number(w.net_bux),
        destination: w.destination,
        status: w.status,
        adminNote: w.admin_note,
        createdAt: Number(w.created_at),
        updatedAt: Number(w.updated_at),
        processedAt: w.processed_at ? Number(w.processed_at) : null
      }))
    });
  } catch (error) {
    console.error("Withdrawal list error:", error);
    res.status(500).json({ success: false, message: "Unable to load withdrawals." });
  }
});

app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const where = status ? "WHERE w.status=$1" : "";
    const params = status ? [status] : [];
    const result = await pool.query(
      `SELECT w.*,u.username,u.first_name,u.last_name
       FROM withdrawals w
       LEFT JOIN users u ON u.id=w.user_id
       ${where}
       ORDER BY w.created_at DESC LIMIT 200`,
      params
    );
    res.json({
      success: true,
      withdrawals: result.rows.map(w => ({
        id: Number(w.id),
        userId: w.user_id,
        username: w.username || "",
        firstName: w.first_name || "",
        lastName: w.last_name || "",
        amountBux: Number(w.amount_bux),
        feeBux: Number(w.fee_bux),
        netBux: Number(w.net_bux),
        destination: w.destination,
        status: w.status,
        adminNote: w.admin_note,
        createdAt: Number(w.created_at),
        updatedAt: Number(w.updated_at),
        processedAt: w.processed_at ? Number(w.processed_at) : null
      }))
    });
  } catch (error) {
    console.error("Admin withdrawals error:", error);
    res.status(500).json({ success: false, message: "Unable to load withdrawals." });
  }
});

app.put("/api/admin/withdrawals/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const nextStatus = String(req.body?.status || "").toLowerCase();
  const note = String(req.body?.adminNote || "").trim().slice(0, 1000);
  const allowed = new Set(["pending","approved","paid","rejected","cancelled"]);

  if (!allowed.has(nextStatus)) {
    return res.status(400).json({ success: false, message: "Invalid withdrawal status." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`,
      [id]
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Withdrawal not found." });
    }

    const w = current.rows[0];
    const finalStatuses = new Set(["paid","rejected","cancelled"]);
    if (finalStatuses.has(w.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "This withdrawal is already finalized." });
    }

    if (nextStatus === "pending" && w.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Cannot move a withdrawal back to pending." });
    }

    const refunding = (nextStatus === "rejected" || nextStatus === "cancelled")
      && !["rejected","cancelled"].includes(w.status);

    if (refunding) {
      await client.query(
        `UPDATE users SET bux=bux+$1 WHERE id=$2`,
        [Number(w.amount_bux), w.user_id]
      );
    }

    const now = Date.now();
    const processedAt = ["paid","rejected","cancelled"].includes(nextStatus) ? now : null;
    const updated = await client.query(
      `UPDATE withdrawals
       SET status=$1, admin_note=$2, updated_at=$3, processed_at=$4
       WHERE id=$5 RETURNING *`,
      [nextStatus, note, now, processedAt, id]
    );

    await client.query("COMMIT");

    await audit(
      req.admin.adminId,
      "update_withdrawal",
      id,
      `user=${w.user_id};from=${w.status};to=${nextStatus};amount=${w.amount_bux}`
    );

    res.json({
      success: true,
      withdrawal: {
        id: Number(updated.rows[0].id),
        status: updated.rows[0].status,
        adminNote: updated.rows[0].admin_note
      }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin withdrawal update error:", error);
    res.status(500).json({ success: false, message: "Unable to update withdrawal." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/tasks", requireAdmin, async (req, res) => {

  try {
    const result = await pool.query(
      `SELECT *
       FROM tasks
       ORDER BY created_at ASC`
    );

    res.json({
      success: true,
      tasks: result.rows.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        reward: Number(task.reward),
        type: task.type,
        duration: Number(task.duration),
        icon: task.icon,
        active: Boolean(task.active),
        repeatable: Boolean(task.repeatable),
        cooldown: Number(task.cooldown_seconds)
      }))
    });
  } catch (error) {
    console.error("Admin tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load tasks."
    });
  }
});

app.post("/api/admin/tasks", requireAdmin, async (req, res) => {
  const id = String(req.body?.id || "").trim();
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "");
  const reward = safeNumber(req.body?.reward, 0);
  const duration = safeNumber(req.body?.duration, 0);
  const icon = String(req.body?.icon || "🎯");
  const type = String(req.body?.type || "timer");
  const repeatable = Boolean(req.body?.repeatable);
  const cooldown = safeNumber(req.body?.cooldown, 0);
  const active = req.body?.active !== false;

  if (!id || !title || !Number.isInteger(reward) || reward < 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid task data."
    });
  }

  try {
    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO tasks
       (id,title,description,reward,type,duration,icon,active,
        repeatable,cooldown_seconds,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [id, title, description, reward, type, duration, icon, active, repeatable, cooldown, now]
    );

    await audit(req.admin.adminId, "create_task", id, title);

    res.json({
      success: true,
      task: result.rows[0]
    });
  } catch (error) {
    console.error("Admin create task error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Task ID already exists."
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to create task."
    });
  }
});

app.put("/api/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "");
  const reward = safeNumber(req.body?.reward, 0);
  const duration = safeNumber(req.body?.duration, 0);
  const icon = String(req.body?.icon || "🎯");
  const type = String(req.body?.type || "timer");
  const repeatable = Boolean(req.body?.repeatable);
  const cooldown = safeNumber(req.body?.cooldown, 0);
  const active = req.body?.active !== false;

  if (!title || !Number.isInteger(reward) || reward < 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid task data."
    });
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title=$1, description=$2, reward=$3, type=$4, duration=$5,
           icon=$6, active=$7, repeatable=$8, cooldown_seconds=$9, updated_at=$10
       WHERE id=$11
       RETURNING *`,
      [title, description, reward, type, duration, icon, active, repeatable, cooldown, Date.now(), id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    await audit(req.admin.adminId, "update_task", id, title);

    res.json({
      success: true,
      task: result.rows[0]
    });
  } catch (error) {
    console.error("Admin update task error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to update task."
    });
  }
});

app.delete("/api/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id=$1 RETURNING id",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    await audit(req.admin.adminId, "delete_task", id);

    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete task error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to delete task."
    });
  }
});

app.get("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key,value,updated_at FROM settings ORDER BY key"
    );

    res.json({
      success: true,
      settings: Object.fromEntries(
        result.rows.map(row => [row.key, row.value])
      )
    });
  } catch (error) {
    console.error("Admin settings error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load settings."
    });
  }
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  const values = req.body?.settings;

  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return res.status(400).json({
      success: false,
      message: "settings object is required."
    });
  }

  try {
    for (const [key, value] of Object.entries(values)) {
      await pool.query(
        `INSERT INTO settings (key,value,updated_at)
         VALUES ($1,$2,$3)
         ON CONFLICT (key)
         DO UPDATE SET value=$2, updated_at=$3`,
        [String(key), String(value), Date.now()]
      );
    }

    await audit(
      req.admin.adminId,
      "update_settings",
      "",
      Object.keys(values).join(",")
    );

    const result = await pool.query(
      "SELECT key,value FROM settings ORDER BY key"
    );

    res.json({
      success: true,
      settings: Object.fromEntries(
        result.rows.map(row => [row.key, row.value])
      )
    });
  } catch (error) {
    console.error("Admin settings update error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to save settings."
    });
  }
});

app.get("/api/admin/audit", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,admin_id,action,target_id,details,created_at
       FROM admin_audit
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    console.error("Admin audit error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load audit logs."
    });
  }
});

// ============================
// Health
// ============================

app.get("/", (req, res) => {
  const indexFile = path.join(__dirname, "public", "index.html");

  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "DzMoney API is working"
  });
});

app.get("/api/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      app: "DzMoney",
      status: "online",
      database: "postgresql",
      systemEnabled: await isSystemEnabled(),
      node: process.version
    });
  } catch (error) {
    console.error(error);

    res.status(503).json({
      success: false,
      status: "database_error"
    });
  }
});

// ============================
// User
// ============================

app.get("/api/user", requireSystemEnabled, async (req, res) => {
  try {
    const user = await getUser(getUserId(req), getTelegramUser(req));

    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: "This account is banned."
      });
    }

    res.json({
      success: true,
      user: formatUser(user)
    });
  } catch (error) {
    console.error("User error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load user."
    });
  }
});

// ============================
// Tasks
// ============================

app.get("/api/tasks", requireSystemEnabled, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await getUser(userId);

    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: "This account is banned."
      });
    }

    const result = await pool.query(
      `SELECT t.*, c.claimed_at
       FROM tasks t
       LEFT JOIN task_claims c
       ON c.task_id=t.id AND c.user_id=$1
       WHERE t.active=TRUE
       ORDER BY t.created_at ASC`,
      [userId]
    );

    res.json({
      success: true,
      tasks: result.rows.map(task => {
        const claimedAt =
          task.claimed_at == null
            ? null
            : Number(task.claimed_at);

        let completed = false;

        if (claimedAt !== null) {
          completed = task.repeatable
            ? cooldownActive(
                claimedAt,
                Number(task.cooldown_seconds)
              )
            : true;
        }

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          reward: Number(task.reward),
          type: task.type,
          duration: Number(task.duration),
          icon: task.icon,
          active: Boolean(task.active),
          completed
        };
      })
    });
  } catch (error) {
    console.error("Tasks error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load tasks."
    });
  }
});

// ============================
// Claim task
// ============================

app.post("/api/tasks/:taskId/claim", requireSystemEnabled, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = getUserId(req);
    const taskId = req.params.taskId;

    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [userId]
    );

    let user;

    if (userResult.rowCount) {
      user = userResult.rows[0];
    } else {
      const created = await client.query(
        `INSERT INTO users
         (id,coins,bux,created_at,daily_claim_at,referral_code)
         VALUES ($1,0,0,$2,0,$3)
         RETURNING *`,
        [userId, Date.now(), makeReferralCode(userId)]
      );

      user = created.rows[0];
    }

    if (user.is_banned) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "This account is banned."
      });
    }

    const taskResult = await client.query(
      "SELECT * FROM tasks WHERE id=$1 AND active=TRUE",
      [taskId]
    );

    if (!taskResult.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    const task = taskResult.rows[0];

    const claimResult = await client.query(
      `SELECT * FROM task_claims
       WHERE user_id=$1 AND task_id=$2
       FOR UPDATE`,
      [userId, taskId]
    );

    const previous = claimResult.rowCount
      ? claimResult.rows[0]
      : null;

    if (previous && !task.repeatable) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Task already completed."
      });
    }

    if (
      previous &&
      task.repeatable &&
      cooldownActive(
        Number(previous.claimed_at),
        Number(task.cooldown_seconds)
      )
    ) {
      const remaining =
        Number(task.cooldown_seconds) * 1000 -
        (Date.now() - Number(previous.claimed_at));

      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Task is not available yet.",
        remaining: Math.ceil(Math.max(0, remaining) / 1000)
      });
    }

    const reward = Number(task.reward);
    const coins = reward * 10;
    const now = Date.now();

    const updated = await client.query(
      `UPDATE users
       SET coins=coins+$1, bux=bux+$2
       WHERE id=$3
       RETURNING *`,
      [coins, reward, userId]
    );

    await creditReferral(client, userId, reward);

    if (previous) {
      await client.query(
        `UPDATE task_claims
         SET claimed_at=$1,reward=$2
         WHERE user_id=$3 AND task_id=$4`,
        [now, reward, userId, taskId]
      );
    } else {
      await client.query(
        `INSERT INTO task_claims
         (user_id,task_id,claimed_at,reward)
         VALUES ($1,$2,$3,$4)`,
        [userId, taskId, now, reward]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `You earned ${reward} BUX!`,
      reward,
      user: formatUser(updated.rows[0])
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Claim error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to claim task."
    });
  } finally {
    client.release();
  }
});

// ============================
// Daily reward
// ============================

app.post("/api/daily/claim", requireSystemEnabled, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = getUserId(req);

    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [userId]
    );

    let user;

    if (result.rowCount) {
      user = result.rows[0];
    } else {
      const created = await client.query(
        `INSERT INTO users
         (id,coins,bux,created_at,daily_claim_at,referral_code)
         VALUES ($1,0,0,$2,0,$3)
         RETURNING *`,
        [userId, Date.now(), makeReferralCode(userId)]
      );

      user = created.rows[0];
    }

    if (user.is_banned) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "This account is banned."
      });
    }

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const last = Number(user.daily_claim_at) || 0;

    if (last && now - last < cooldown) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Daily reward is not available yet.",
        remaining: Math.ceil(
          (cooldown - (now - last)) / 1000
        )
      });
    }

    const coinsReward = 1000;
    const buxReward = 1;

    const updated = await client.query(
      `UPDATE users
       SET coins=coins+$1,
           bux=bux+$2,
           daily_claim_at=$3
       WHERE id=$4
       RETURNING *`,
      [coinsReward, buxReward, now, userId]
    );

    await creditReferral(client, userId, buxReward);

    await client.query("COMMIT");

    res.json({
      success: true,
      reward: {
        coins: coinsReward,
        bux: buxReward
      },
      user: formatUser(updated.rows[0])
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Daily reward error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to claim daily reward."
    });
  } finally {
    client.release();
  }
});

// ============================
// Database verification
// ============================

app.get("/api/database/status", async (req, res) => {
  try {
    const users = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users"
    );

    const tasks = await pool.query(
      "SELECT COUNT(*)::int AS count FROM tasks"
    );

    const claims = await pool.query(
      "SELECT COUNT(*)::int AS count FROM task_claims"
    );
    const withdrawals = await pool.query(
      "SELECT COUNT(*)::int AS count FROM withdrawals"
    );

    res.json({
      success: true,
      database: "postgresql",
      systemEnabled: await isSystemEnabled(),
      tables: {
        users: users.rows[0].count,
        tasks: tasks.rows[0].count,
        taskClaims: claims.rows[0].count,
        withdrawals: withdrawals.rows[0].count
      }
    });
  } catch (error) {
    console.error("Database status error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to read database."
    });
  }
});

// ============================
// Start
// ============================

async function start() {
  try {
    console.log("DzMoney starting...");
    console.log("Node:", process.version);
    console.log("PORT:", PORT);

    await pool.query("SELECT 1");
    console.log("PostgreSQL connection: OK");

    await initDatabase();
    console.log("PostgreSQL schema/settings/tasks: OK");

    await migrateLegacyData();
    console.log("Legacy migration: OK");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `DzMoney server running on 0.0.0.0:${PORT}`
      );
    });
  } catch (error) {
    console.error("STARTUP FAILED:", error);
    process.exit(1);
  }
}

start();
