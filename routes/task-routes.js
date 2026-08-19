"use strict";

const { listAvailableTasks, startTask } = require("../services/task-api");
const { authenticateTelegramWebApp } = require("../services/telegram-task-auth");

function installTaskRoutes(app, pool, botToken) {
  if (!app || !pool) throw new Error("app and pool are required");

  app.get("/api/tasks", authenticateTelegramWebApp(botToken), async (req, res) => {
    try {
      const tasks = await listAvailableTasks(pool, String(req.telegramUser.id));
      res.json({ ok: true, tasks });
    } catch (error) {
      console.error("GET /api/tasks failed:", error);
      res.status(500).json({ ok: false, error: "TASKS_UNAVAILABLE" });
    }
  });

  app.post("/api/tasks/:taskId/start", authenticateTelegramWebApp(botToken), async (req, res) => {
    try {
      const result = await startTask(pool, String(req.telegramUser.id), req.params.taskId);
      res.json({ ok: true, task: { id: result.task.id, type: result.task.type, title: result.task.title, verificationMethod: result.task.verification_method }, completion: result.completion });
    } catch (error) {
      if (error.code === "TASK_COOLDOWN") return res.status(409).json({ ok: false, error: error.code, nextAvailableAt: error.nextAvailableAt });
      if (error.message === "Task not found or inactive.") return res.status(404).json({ ok: false, error: "TASK_NOT_FOUND" });
      console.error("POST /api/tasks/:taskId/start failed:", error);
      return res.status(500).json({ ok: false, error: "TASK_START_FAILED" });
    }
  });
}

module.exports = { installTaskRoutes };
