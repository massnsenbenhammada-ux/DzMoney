"use strict";

const { Pool } = require("pg");

const DEFAULTS = Object.freeze({
  bux_per_ton: "10000",
  coins_per_bux: "100",
  daily_reward_coins: "1000",
  daily_reward_bux: "1",
  daily_reward_cooldown_seconds: "86400",
  minimum_withdraw_bux: "2000",
  withdrawal_fee_bux: "0",
  referral_percentage: "12",
  daily_ads_limit: "20",
  system_enabled: "true"
});

let pool = null;
let cache = new Map(Object.entries(DEFAULTS));
let cacheAt = 0;
let refreshPromise = null;

function ensurePool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

async function refresh(force = false) {
  const now = Date.now();
  if (!force && now - cacheAt < 1000) return cache;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const result = await ensurePool().query("SELECT key,value FROM settings");
      const next = new Map(Object.entries(DEFAULTS));
      for (const row of result.rows) next.set(String(row.key), String(row.value));
      cache = next;
      cacheAt = Date.now();
      return cache;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function get(key, fallback = DEFAULTS[key] ?? "") {
  const values = await refresh();
  return values.has(key) ? values.get(key) : String(fallback);
}

async function getNumber(key, fallback = Number(DEFAULTS[key] ?? 0)) {
  const value = Number(await get(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

async function getWholeNumber(key, fallback = Number(DEFAULTS[key] ?? 0)) {
  const value = await getNumber(key, fallback);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

async function getBoolean(key, fallback = String(DEFAULTS[key]).toLowerCase() === "true") {
  const value = String(await get(key, fallback ? "true" : "false")).toLowerCase();
  return value === "true" ? true : value === "false" ? false : fallback;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = {
  DEFAULTS,
  refresh,
  get,
  getNumber,
  getWholeNumber,
  getBoolean,
  close
};
