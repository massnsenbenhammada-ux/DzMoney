const express = require("express");
const fs = require("fs");
const path = require("path");
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
      is_banned BOOLEAN NOT NULL DEFAULT FALSE
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
    referral_percentage: "12"
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

function getUserId(req) {
  const telegramUser =
    req.body?.telegramUser ||
    req.query?.telegramUser;

  if (telegramUser?.id) {
    return String(telegramUser.id);
  }

  return "demo-user";
}

async function getUser(id) {
  const result = await pool.query(
    "SELECT * FROM users WHERE id=$1",
    [id]
  );

  if (result.rowCount) {
    return result.rows[0];
  }

  const created = await pool.query(
    `INSERT INTO users
     (id,coins,bux,created_at,daily_claim_at)
     VALUES ($1,0,0,$2,0)
     RETURNING *`,
    [id, Date.now()]
  );

  return created.rows[0];
}

function formatUser(user) {
  return {
    id: user.id,
    coins: Number(user.coins),
    bux: Number(user.bux),
    ton: Number(user.bux) / 10000,
    dailyClaimAt: Number(user.daily_claim_at) || 0,
    isBanned: Boolean(user.is_banned)
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

app.get("/api/user", async (req, res) => {
  try {
    const user = await getUser(getUserId(req));

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

app.get("/api/tasks", async (req, res) => {
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

app.post("/api/tasks/:taskId/claim", async (req, res) => {
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
         (id,coins,bux,created_at,daily_claim_at)
         VALUES ($1,0,0,$2,0)
         RETURNING *`,
        [userId, Date.now()]
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

app.post("/api/daily/claim", async (req, res) => {
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
         (id,coins,bux,created_at,daily_claim_at)
         VALUES ($1,0,0,$2,0)
         RETURNING *`,
        [userId, Date.now()]
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

    res.json({
      success: true,
      database: "postgresql",
      tables: {
        users: users.rows[0].count,
        tasks: tasks.rows[0].count,
        taskClaims: claims.rows[0].count
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
