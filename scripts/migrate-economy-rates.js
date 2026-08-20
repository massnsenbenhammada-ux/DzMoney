"use strict";

const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS economy_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    const now = Date.now();
    const defaults = [
      ["dzx_per_ton", "10000"],
      ["coins_per_dzx", "100"],
      ["coins_per_ton", "1000000"]
    ];

    for (const [key, value] of defaults) {
      await pool.query(
        `INSERT INTO economy_settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO NOTHING`,
        [key, value, now]
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    for (const [key, value] of defaults) {
      await pool.query(
        `INSERT INTO settings(key,value,updated_at)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO NOTHING`,
        [key, value, now]
      );
    }

    console.log("Economy rates migration: OK (TON/DZX/COIN rates are admin-controlled)");
  } catch (error) {
    console.error("Economy rates migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
