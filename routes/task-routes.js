"use strict";

const { listAvailableTasks, startTask } = require("../services/task-api");
const { telegramTaskAuth } = require("../services/telegram-task-auth");
const { verifyAndRewardDailyTask } = require("../services/daily-task-service");

function installTaskRoutes(app, pool, botToken) {
  if (!app || !pool) throw new Error("app and pool are required");
  const auth = telegramTaskAuth({ botToken });

  app.get("/api/v2/tasks", auth, async (req, res) => {
    try {
      const tasks = await listAvailableTasks(pool, String(req.telegramUser.id));
      res.json({ ok: true, tasks });
    } catch (error) {
      console.error("GET /api/v2/tasks failed:", error);
      res.status(500).json({ ok: false, error: "TASKS_UNAVAILABLE" });
    }
  });

  app.post("/api/v2/tasks/:taskId/start", auth, async (req, res) => {
    try {
      const result = await startTask(pool, String(req.telegramUser.id), req.params.taskId);
      res.json({ ok: true, task: { id: result.task.id, type: result.task.type, title: result.task.title, verificationMethod: result.task.verification_method }, completion: result.completion });
    } catch (error) {
      if (error.code === "TASK_COOLDOWN") return res.status(409).json({ ok: false, error: error.code, nextAvailableAt: error.nextAvailableAt });
      if (error.message === "Task not found or inactive.") return res.status(404).json({ ok: false, error: "TASK_NOT_FOUND" });
      console.error("POST /api/v2/tasks/:taskId/start failed:", error);
      return res.status(500).json({ ok: false, error: "TASK_START_FAILED" });
    }
  });

  app.post("/api/v2/tasks/:taskId/verify", auth, async (req, res) => {
    try {
      const result = await verifyAndRewardDailyTask(pool, String(req.telegramUser.id), req.params.taskId, req.body || {});
      res.json({ ok: true, status: "rewarded", reward: { coins: result.coins, dzx: result.dzx }, completion: result.completion, rewardEventId: result.rewardEventId });
    } catch (error) {
      const statusByCode = {
        TASK_NOT_FOUND: 404,
        TASK_ALREADY_COMPLETED: 409,
        EXTERNAL_VERIFICATION_REQUIRED: 409,
        INVALID_TASK_TYPE: 400
      };
      const status = statusByCode[error.code] || 500;
      if (status >= 500) console.error("POST /api/v2/tasks/:taskId/verify failed:", error);
      res.status(status).json({ ok: false, error: error.code || "TASK_VERIFY_FAILED", message: error.message, method: error.method || undefined });
    }
  });
}

module.exports = { installTaskRoutes };
