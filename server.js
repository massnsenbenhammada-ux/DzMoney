const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

// ============================
// Middleware
// ============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================
// Static files
// ============================

app.use(express.static(path.join(__dirname, "public")));

// ============================
// PostgreSQL
// ============================

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// ============================
// Database initialization
// ============================

async function initDatabase() {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    // ========================
    // Users
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        coins BIGINT NOT NULL DEFAULT 0,
        bux NUMERIC(20,4) NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        daily_claim_at BIGINT NOT NULL DEFAULT 0
      )
    `);


    // ========================
    // Task claims
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_claims (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        claimed_at BIGINT NOT NULL,
        reward NUMERIC(20,4) NOT NULL DEFAULT 0,
        UNIQUE(user_id, task_id)
      )
    `);


    // ========================
    // Future referral system
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL
      )
    `);


    // ========================
    // Future withdrawals
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_bux NUMERIC(20,4) NOT NULL,
        amount_coins BIGINT NOT NULL DEFAULT 0,
        amount_ton NUMERIC(20,8) NOT NULL,
        wallet_address TEXT,
        fee_ton NUMERIC(20,8) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);


    // ========================
    // Future advertisements
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_views (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ad_type TEXT NOT NULL,
        reward_coins BIGINT NOT NULL DEFAULT 0,
        reward_bux NUMERIC(20,4) NOT NULL DEFAULT 0,
        viewed_at BIGINT NOT NULL
      )
    `);


    // ========================
    // Future user-created tasks
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_tasks (
        id BIGSERIAL PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        reward_coins BIGINT NOT NULL DEFAULT 0,
        reward_bux NUMERIC(20,4) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at BIGINT NOT NULL
      )
    `);


    // ========================
    // Future transactions
    // ========================

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        coins BIGINT NOT NULL DEFAULT 0,
        bux NUMERIC(20,4) NOT NULL DEFAULT 0,
        description TEXT,
        created_at BIGINT NOT NULL
      )
    `);


    await client.query("COMMIT");

    console.log("PostgreSQL database initialized successfully.");

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "Database initialization error:",
      error
    );

    throw error;

  } finally {

    client.release();

  }
}


// ============================
// Tasks
// ============================

const TASKS = [

  {
    id: "video",
    title: "Watch a video",
    description: "Watch the video and earn 10 BUX",
    reward: 10,
    type: "timer",
    duration: 15,
    icon: "📺"
  },

  {
    id: "website",
    title: "Visit a website",
    description: "Visit the website and earn 25 BUX",
    reward: 25,
    type: "timer",
    duration: 10,
    icon: "🌐"
  },

  {
    id: "daily",
    title: "Daily activity",
    description: "Complete today's activity and earn 50 BUX",
    reward: 50,
    type: "timer",
    duration: 20,
    icon: "⭐"
  },

  {
    id: "special",
    title: "Special task",
    description: "Complete the special task and earn 100 BUX",
    reward: 100,
    type: "timer",
    duration: 30,
    icon: "🎁"
  }

];


// ============================
// Helpers
// ============================

function getUserId(req) {

  const telegramUser =
    req.body?.telegramUser ||
    req.query?.telegramUser;

  if (
    telegramUser &&
    telegramUser.id
  ) {

    return String(
      telegramUser.id
    );

  }

  return "demo-user";
}


// ============================
// Get or create user
// ============================

async function getUser(userId) {

  const result = await pool.query(
    `
      SELECT
        id,
        coins,
        bux,
        created_at,
        daily_claim_at
      FROM users
      WHERE id = $1
    `,
    [userId]
  );


  if (result.rows.length > 0) {

    return result.rows[0];

  }


  const now =
    Date.now();


  const created =
    await pool.query(
      `
        INSERT INTO users (
          id,
          coins,
          bux,
          created_at,
          daily_claim_at
        )
        VALUES (
          $1,
          0,
          0,
          $2,
          0
        )
        RETURNING
          id,
          coins,
          bux,
          created_at,
          daily_claim_at
      `,
      [
        userId,
        now
      ]
    );


  return created.rows[0];

}


// ============================
// Health
// ============================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


app.get("/api", (req, res) => {

  res.json({

    success: true,

    message:
      "DzMoney API is working"

  });

});


app.get("/api/status", async (req, res) => {

  try {

    await pool.query(
      "SELECT 1"
    );

    res.json({

      success: true,

      app: "DzMoney",

      status: "online",

      database: "connected",

      node: process.version

    });

  } catch (error) {

    console.error(
      "Database health error:",
      error
    );

    res.status(500).json({

      success: false,

      app: "DzMoney",

      status: "online",

      database: "error",

      node: process.version

    });

  }

});


// ============================
// User
// ============================

app.get("/api/user", async (req, res) => {

  try {

    const userId =
      getUserId(req);

    const user =
      await getUser(userId);


    res.json({

      success: true,

      user: {

        id:
          user.id,

        coins:
          Number(user.coins),

        bux:
          Number(user.bux),

        ton:
          Number(user.bux) / 10000,

        dailyClaimAt:
          Number(user.daily_claim_at)

      }

    });

  } catch (error) {

    console.error(
      "User API error:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Unable to load user."

    });

  }

});


// ============================
// Tasks list
// ============================

app.get("/api/tasks", async (req, res) => {

  try {

    const userId =
      getUserId(req);

    const result =
      await pool.query(
        `
          SELECT
            task_id,
            claimed_at,
            reward
          FROM task_claims
          WHERE user_id = $1
        `,
        [userId]
      );


    const claims = {};

    for (
      const row of result.rows
    ) {

      claims[row.task_id] =
        row;

    }


    const now =
      Date.now();


    const tasks =
      TASKS.map(task => {

        const claim =
          claims[task.id];

        let completed =
          false;


        if (claim) {

          if (
            task.id === "daily"
          ) {

            completed =
              now -
              Number(claim.claimed_at)
              <
              24 *
              60 *
              60 *
              1000;

          } else {

            completed = true;

          }

        }


        return {

          ...task,

          completed

        };

      });


    res.json({

      success: true,

      tasks

    });

  } catch (error) {

    console.error(
      "Tasks API error:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Unable to load tasks."

    });

  }

});


// ============================
// Claim task
// ============================

app.post(
  "/api/tasks/:taskId/claim",
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const userId =
        getUserId(req);

      const taskId =
        req.params.taskId;


      const task =
        TASKS.find(
          item =>
            item.id === taskId
        );


      if (!task) {

        return res.status(404).json({

          success: false,

          message:
            "Task not found"

        });

      }


      await client.query(
        "BEGIN"
      );


      const user =
        await getUser(userId);


      const previousResult =
        await client.query(
          `
            SELECT
              claimed_at,
              reward
            FROM task_claims
            WHERE user_id = $1
            AND task_id = $2
            FOR UPDATE
          `,
          [
            userId,
            taskId
          ]
        );


      const previous =
        previousResult.rows[0];


      const now =
        Date.now();


      // Daily task cooldown

      if (
        previous &&
        taskId === "daily" &&
        now -
        Number(previous.claimed_at)
        <
        24 *
        60 *
        60 *
        1000
      ) {

        const remaining =
          24 *
          60 *
          60 *
          1000 -
          (
            now -
            Number(previous.claimed_at)
          );


        await client.query(
          "ROLLBACK"
        );


        return res.status(400).json({

          success: false,

          message:
            "Daily task is not available yet.",

          remaining:
            Math.ceil(
              remaining / 1000
            )

        });

      }


      // Other tasks can only be claimed once

      if (
        previous &&
        taskId !== "daily"
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(400).json({

          success: false,

          message:
            "Task already completed."

        });

      }


      const rewardBux =
        Number(task.reward);


      const rewardCoins =
        rewardBux * 10;


      // Update balance

      await client.query(
        `
          UPDATE users
          SET
            bux = bux + $1,
            coins = coins + $2
          WHERE id = $3
        `,
        [
          rewardBux,
          rewardCoins,
          userId
        ]
      );


      // Record claim

      if (previous) {

        await client.query(
          `
            UPDATE task_claims
            SET
              claimed_at = $1,
              reward = $2
            WHERE user_id = $3
            AND task_id = $4
          `,
          [
            now,
            rewardBux,
            userId,
            taskId
          ]
        );

      } else {

        await client.query(
          `
            INSERT INTO task_claims (
              user_id,
              task_id,
              claimed_at,
              reward
            )
            VALUES (
              $1,
              $2,
              $3,
              $4
            )
          `,
          [
            userId,
            taskId,
            now,
            rewardBux
          ]
        );

      }


      // Transaction history

      await client.query(
        `
          INSERT INTO transactions (
            user_id,
            type,
            coins,
            bux,
            description,
            created_at
          )
          VALUES (
            $1,
            'task_reward',
            $2,
            $3,
            $4,
            $5
          )
        `,
        [
          userId,
          rewardCoins,
          rewardBux,
          `Task reward: ${task.title}`,
          now
        ]
      );


      const updatedResult =
        await client.query(
          `
            SELECT
              coins,
              bux
            FROM users
            WHERE id = $1
          `,
          [userId]
        );


      const updated =
        updatedResult.rows[0];


      await client.query(
        "COMMIT"
      );


      res.json({

        success: true,

        message:
          `You earned ${rewardBux} BUX!`,

        reward:
          rewardBux,

        user: {

          coins:
            Number(updated.coins),

          bux:
            Number(updated.bux),

          ton:
            Number(updated.bux) /
            10000

        }

      });

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Task claim error:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to claim task."

      });

    } finally {

      client.release();

    }

  }
);


// ============================
// Daily reward
// ============================

app.post(
  "/api/daily/claim",
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const userId =
        getUserId(req);


      await client.query(
        "BEGIN"
      );


      const user =
        await getUser(userId);


      const now =
        Date.now();


      const cooldown =
        24 *
        60 *
        60 *
        1000;


      if (
        user.daily_claim_at &&
        now -
        Number(user.daily_claim_at)
        <
        cooldown
      ) {

        const remaining =
          cooldown -
          (
            now -
            Number(user.daily_claim_at)
          );


        await client.query(
          "ROLLBACK"
        );


        return res.status(400).json({

          success: false,

          message:
            "Daily reward is not available yet.",

          remaining:
            Math.ceil(
              remaining / 1000
            )

        });

      }


      // Current agreed reward:
      // 1000 Coins + 1 BUX

      await client.query(
        `
          UPDATE users
          SET
            coins = coins + 1000,
            bux = bux + 1,
            daily_claim_at = $1
          WHERE id = $2
        `,
        [
          now,
          userId
        ]
      );


      await client.query(
        `
          INSERT INTO transactions (
            user_id,
            type,
            coins,
            bux,
            description,
            created_at
          )
          VALUES (
            $1,
            'daily_reward',
            1000,
            1,
            'Daily reward',
            $2
          )
        `,
        [
          userId,
          now
        ]
      );


      const updatedResult =
        await client.query(
          `
            SELECT
              coins,
              bux,
              daily_claim_at
            FROM users
            WHERE id = $1
          `,
          [userId]
        );


      const updated =
        updatedResult.rows[0];


      await client.query(
        "COMMIT"
      );


      res.json({

        success: true,

        reward: {

          coins: 1000,

          bux: 1

        },

        user: {

          coins:
            Number(updated.coins),

          bux:
            Number(updated.bux),

          ton:
            Number(updated.bux) /
            10000,

          dailyClaimAt:
            Number(updated.daily_claim_at)

        }

      });

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Daily reward error:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to claim daily reward."

      });

    } finally {

      client.release();

    }

  }
);


// ============================
// Error handler
// ============================

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Internal server error."

    });

  }
);


// ============================
// Start server
// ============================

async function startServer() {

  try {

    await initDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "================================"
        );

        console.log(
          "DzMoney starting..."
        );

        console.log(
          "Node:",
          process.version
        );

        console.log(
          "PORT:",
          PORT
        );

        console.log(
          "Database: PostgreSQL"
        );

        console.log(
          `DzMoney server running on 0.0.0.0:${PORT}`
        );

        console.log(
          "================================"
        );

      }
    );

  } catch (error) {

    console.error(
      "Failed to start DzMoney:",
      error
    );

    process.exit(1);

  }

}


startServer();
