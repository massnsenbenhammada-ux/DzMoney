"use strict";

// Small read-only registration companion for the canonical Admin control.
// It uses the real Express app at listen-time; it does not monkey-patch routes.
const express = require("express");
const { Pool } = require("pg");

const originalListen = express.application.listen;
let installed = false;

function adminToken(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const value = part.trim();
    if (value.startsWith("dz_admin=")) return value.slice("dz_admin=".length);
  }
  return "";
}

function install(app) {
  if (installed || !process.env.DATABASE_URL) return;
  installed = true;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  app.get("/api/admin/users/:id/economy", async (req, res) => {
    try {
      if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ success: false, message: "Admin panel is disabled." });
      if (req.headers["x-dzmoney-admin-request"] !== "1") return res.status(403).json({ success: false, message: "Invalid admin request." });
      const token = adminToken(req);
      if (!token) return res.status(401).json({ success: false, message: "Admin authentication required." });
      const session = await pool.query("SELECT admin_id FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1", [token, Date.now()]);
      if (!session.rowCount) return res.status(401).json({ success: false, message: "Admin authentication required." });

      const result = await pool.query(
        "SELECT id,dzp,dzx,coins,deposited_dzx,withdrawable_dzx,locked_dzx FROM users WHERE id=$1 LIMIT 1",
        [String(req.params.id)]
      );
      if (!result.rowCount) return res.status(404).json({ success: false, message: "User not found." });
      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error("Admin economy read error:", error);
      res.status(500).json({ success: false, message: "Unable to load user economy." });
    }
  });

  process.once("exit", () => pool.end().catch(() => {}));
}

express.application.listen = function (...args) {
  install(this);
  return originalListen.apply(this, args);
};
