"use strict";

const { listAvailableTasks, startTask } = require("../services/task-api");
const { telegramTaskAuth } = require("../services/telegram-task-auth");
const { verifyAndRewardDailyTask, recordAdCompletion, confirmAdsGramReward } = require("../services/daily-task-service");

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

  // Client-side onReward only registers a pending view. The counter is
  // advanced only after AdsGram calls the server-side Reward URL below.
  app.post("/api/v2/tasks/view_ads/ad-complete", auth, async (req, res) => {
    try {
      const result = await recordAdCompletion(pool, String(req.telegramUser.id), req.body || {});
      res.json({
        ok: true,
        pending: Boolean(result.pending),
        pendingViewId: result.pendingViewId || null,
        completedCount: result.completedCount,
        requiredCount: result.requiredCount,
        completed: result.completed,
        reward: result.completed ? { coins: result.coins, dzx: result.dzx } : null,
        completion: result.completion,
        rewardEventId: result.rewardEventId || null
      });
    } catch (error) {
      const status = error.code === "TASK_NOT_FOUND" ? 404 : 500;
      if (status >= 500) console.error("POST /api/v2/tasks/view_ads/ad-complete failed:", error);
      res.status(status).json({ ok: false, error: error.code || "AD_COMPLETION_FAILED", message: error.message });
    }
  });

  // AdsGram Reward URL callback. AdsGram replaces [userId] with the user's
  // Telegram ID. This endpoint is intentionally NOT protected by Telegram
  // WebApp auth because the request originates from AdsGram, not the browser.
  // Optional ADSGRAM_REWARD_SECRET protects the public URL from arbitrary calls.
  app.get("/api/adsgram/reward", async (req, res) => {
    const configuredSecret = String(process.env.ADSGRAM_REWARD_SECRET || "").trim();
    if (configuredSecret && String(req.query.secret || "") !== configuredSecret) {
      return res.status(401).send("unauthorized");
    }

    try {
      const userId = String(req.query.userid || req.query.userId || "").trim();
      const result = await confirmAdsGramReward(pool, userId);
      if (!result.accepted && result.reason === "NO_PENDING_AD") {
        return res.status(204).end();
      }
      return res.status(200).send("ok");
    } catch (error) {
      console.error("GET /api/adsgram/reward failed:", error);
      return res.status(400).send("invalid");
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
