"use strict";

// Loads the new task API without modifying the legacy /api/tasks routes.
// It hooks Express' listen call so the fully-created application instance is
// available, while using its own PostgreSQL pool. This is temporary isolation
// until the new task flow replaces the legacy routes after verification.
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
      installTaskRoutes(
        this,
        taskPool,
        String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "").trim()
      );
      this.__dzmoneyTaskRoutesInstalled = true;
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
