"use strict";

// Loads the new task API without modifying the legacy /api/tasks routes.
// server.js registers its legacy fallback before app.listen(), so we inject
// the task router immediately before the finalized Express router stack starts.
const express = require("express");
const { Pool } = require("pg");
const { installTaskRoutes } = require("./routes/task-routes");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for task API bootstrap.");
}

const taskPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function getAdminFromRequest(req) {
  const cookieHeader = String(req.headers.cookie || "");
  const token = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("dz_admin="))
    ?.slice("dz_admin=".length) || "";
  if (!token) return null;

  const result = await taskPool.query(
    `SELECT admin_id FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1`,
    [token, Date.now()]
  );
  return result.rowCount ? result.rows[0] : null;
}

function installDzpAdminSettings(router) {
  // The legacy Admin Settings endpoint intentionally rejects unknown settings.
  // DZP settings are a newer economy layer, so intercept only the DZP keys,
  // persist them in both settings tables, then let the legacy handler process
  // every other setting exactly as before.
  router.put("/api/admin/settings", async (req, res, next) => {
    const body = req.body?.settings;
    if (!body || typeof body !== "object" || Array.isArray(body)) return next();

    const dzpKeys = new Set([
      "dzp_referral_reward",
      "dzp_default_activity",
      "dzp_ad_reward"
    ]);
    const incoming = Object.fromEntries(
      Object.entries(body).filter(([key]) => dzpKeys.has(String(key)))
    );
    if (!Object.keys(incoming).length) return next();

    try {
      const admin = await getAdminFromRequest(req);
      if (!admin) return next();

      for (const [key, rawValue] of Object.entries(incoming)) {
        const value = String(rawValue).trim();
        if (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 0 || !Number.isFinite(Number(value))) {
          return res.status(400).json({
            success: false,
            message: `${key} must be a non-negative number.`
          });
        }
      }

      const mapping = {
        dzp_referral_reward: "referral_dzp_reward",
        dzp_default_activity: "default_activity_dzp",
        dzp_ad_reward: "ad_dzp_reward"
      };

      for (const [settingsKey, rawValue] of Object.entries(incoming)) {
        const value = String(rawValue).trim();
        await taskPool.query(
          `INSERT INTO settings(key,value,updated_at)
           VALUES($1,$2,$3)
           ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=$3`,
          [settingsKey, value, Date.now()]
        );
        await taskPool.query(
          `INSERT INTO dzp_settings(key,value,updated_at)
           VALUES($1,$2,NOW())
           ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()`,
          [mapping[settingsKey], value]
        );
      }

      await taskPool.query(
        `INSERT INTO admin_audit(admin_id,action,target_id,details,created_at)
         VALUES($1,'update_dzp_settings','', $2, $3)`,
        [admin.admin_id, Object.keys(incoming).join(","), Date.now()]
      );

      // Remove DZP keys before the legacy handler sees the request.
      const remaining = Object.fromEntries(
        Object.entries(body).filter(([key]) => !dzpKeys.has(String(key)))
      );
      req.body.settings = remaining;

      if (!Object.keys(remaining).length) {
        const result = await taskPool.query("SELECT key,value FROM settings ORDER BY key");
        return res.json({
          success: true,
          settings: Object.fromEntries(result.rows.map(row => [row.key, row.value]))
        });
      }

      return next();
    } catch (error) {
      console.error("DZP admin settings sync error:", error);
      return res.status(500).json({ success: false, message: "Unable to save DZP settings." });
    }
  });
}

const originalListen = express.application.listen;
if (!express.application.__dzmoneyTaskBootstrap) {
  express.application.__dzmoneyTaskBootstrap = true;

  express.application.listen = function patchedListen(...args) {
    if (!this.__dzmoneyTaskRoutesInstalled) {
      const router = express.Router();
      installDzpAdminSettings(router);
      installTaskRoutes(
        router,
        taskPool,
        String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "").trim()
      );

      // Express 5 exposes the router as app.router rather than the old
      // app._router property. Keep compatibility with Express 4 as well.
      const stack = this.router && Array.isArray(this.router.stack)
        ? this.router.stack
        : (this._router && Array.isArray(this._router.stack) ? this._router.stack : null);

      if (!stack) {
        throw new Error("Express router stack is unavailable; task routes were not installed.");
      }

      // Put the new routes ahead of the legacy fallback/404 layers.
      stack.unshift(...router.stack);
      this.__dzmoneyTaskRoutesInstalled = true;
      console.log("Task API v2 routes: mounted before legacy fallback");
    }

    return originalListen.apply(this, args);
  };
}

process.once("SIGTERM", async () => {
  await taskPool.end().catch(() => {});
});
process.once("SIGINT", async () => {
  await taskPool.end().catch(() => {});
});
