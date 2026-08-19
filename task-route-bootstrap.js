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

const originalListen = express.application.listen;
if (!express.application.__dzmoneyTaskBootstrap) {
  express.application.__dzmoneyTaskBootstrap = true;

  express.application.listen = function patchedListen(...args) {
    if (!this.__dzmoneyTaskRoutesInstalled) {
      const router = express.Router();
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
