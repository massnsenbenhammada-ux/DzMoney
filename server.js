const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================
// Static files
// ============================

app.use(express.static(path.join(__dirname, "public")));

// ============================
// Simple JSON database
// ============================

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        users: {},
        taskClaims: {}
      };
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Database load error:", error);

    return {
      users: {},
      taskClaims: {}
    };
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("Database save error:", error);
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

  if (telegramUser && telegramUser.id) {
    return String(telegramUser.id);
  }

  return "demo-user";
}

function getUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      coins: 0,
      bux: 0,
      createdAt: Date.now(),
      dailyClaimAt: 0
    };

    saveData();
  }

  return db.users[userId];
}

function getClaims(userId) {
  if (!db.taskClaims[userId]) {
    db.taskClaims[userId] = {};
    saveData();
  }

  return db.taskClaims[userId];
}

// ============================
// Health
// ============================

app.get("/", (req, res) => {
  const indexFile = path.join(
    __dirname,
    "public",
    "index.html"
  );

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

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online",
    node: process.version
  });
});

// ============================
// User
// ============================

app.get("/api/user", (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);

  res.json({
    success: true,
    user: {
      id: user.id,
      coins: user.coins,
      bux: user.bux,
      ton: user.bux / 10000,
      dailyClaimAt: user.dailyClaimAt
    }
  });
});

// ============================
// Tasks list
// ============================

app.get("/api/tasks", (req, res) => {
  const userId = getUserId(req);
  const claims = getClaims(userId);
  const now = Date.now();

  const tasks = TASKS.map(task => {
    const claim = claims[task.id];

    let completed = false;

    if (claim) {
      if (task.id === "daily") {
        completed =
          now - claim.claimedAt <
          24 * 60 * 60 * 1000;
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
});

// ============================
// Claim task
// ============================

app.post("/api/tasks/:taskId/claim", (req, res) => {
  const userId = getUserId(req);
  const taskId = req.params.taskId;

  const task = TASKS.find(
    item => item.id === taskId
  );

  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found"
    });
  }

  const user = getUser(userId);
  const claims = getClaims(userId);
  const now = Date.now();
  const previous = claims[taskId];

  if (
    previous &&
    taskId === "daily" &&
    now - previous.claimedAt <
      24 * 60 * 60 * 1000
  ) {
    const remaining =
      24 * 60 * 60 * 1000 -
      (now - previous.claimedAt);

    return res.status(400).json({
      success: false,
      message: "Daily task is not available yet.",
      remaining: Math.ceil(remaining / 1000)
    });
  }

  if (
    previous &&
    taskId !== "daily"
  ) {
    return res.status(400).json({
      success: false,
      message: "Task already completed."
    });
  }

  user.bux += task.reward;
  user.coins += task.reward * 10;

  claims[taskId] = {
    claimedAt: now,
    reward: task.reward
  };

  saveData();

  res.json({
    success: true,
    message: `You earned ${task.reward} BUX!`,
    reward: task.reward,
    user: {
      coins: user.coins,
      bux: user.bux,
      ton: user.bux / 10000
    }
  });
});

// ============================
// Daily reward
// ============================

app.post("/api/daily/claim", (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);

  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;

  if (
    user.dailyClaimAt &&
    now - user.dailyClaimAt < cooldown
  ) {
    const remaining =
      cooldown -
      (now - user.dailyClaimAt);

    return res.status(400).json({
      success: false,
      message: "Daily reward is not available yet.",
      remaining: Math.ceil(remaining / 1000)
    });
  }

  user.coins += 1000;
  user.bux += 1;
  user.dailyClaimAt = now;

  saveData();

  res.json({
    success: true,
    reward: {
      coins: 1000,
      bux: 1
    },
    user: {
      coins: user.coins,
      bux: user.bux,
      ton: user.bux / 10000,
      dailyClaimAt: user.dailyClaimAt
    }
  });
});

// ============================
// Start server
// ============================

app.listen(PORT, "0.0.0.0", () => {
  console.log("DzMoney starting...");
  console.log("Node:", process.version);
  console.log("PORT:", PORT);
  console.log(
    `DzMoney server running on 0.0.0.0:${PORT}`
  );
});
