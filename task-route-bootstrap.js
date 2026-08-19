"use strict";

// Loads the new task API without modifying the legacy /api/tasks routes.
// The task routes are mounted through a Router and inserted at the beginning
// of the finalized Express stack. This is important because server.js already
// has legacy fallback/404 middleware registered before app.listen().
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

      // app.listen() is called after server.js has registered its fallback
      // middleware. Mount the new router before that fallback, without
      // changing or replacing any legacy route.
      if (!this._router || !Array.isArray(this._router.stack)) {
        throw new Error("Express router stack is unavailable; task routes were not installed.");
      }
      this._router.stack.unshift(...router.stack);
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
