"use strict";

const { Pool } = require("pg");

// One runtime source for every value controlled by the Admin Panel.
// Defaults are bootstrap/fallback values only; once PostgreSQL is available,
// the cache is replaced by the persisted settings.
const DEFAULTS = Object.freeze({
  bux_per_ton: "10000",
  coins_per_bux: "100",
  dzx_per_ton: "10000",
  coins_per_dzx: "100",
  coins_per_ton: "1000000",
  daily_reward_coins: "1000",
  daily_reward_bux: "1",
  daily_reward_cooldown_seconds: "86400",
  daily_reward_ad_separate: "true",
  daily_ads_limit: "20",
  daily_ad_task_count: "1",
  daily_task_reward_coins: "1000",
  daily_task_reward_dzx: "1",
  minimum_withdraw_bux: "2000",
  withdrawal_fee_bux: "0",
  minimum_withdrawal_coins: "0",
  minimum_withdrawal_ton: "0",
  minimum_deposit_ton: "0",
  withdrawal_fee_dzx: "0",
  referral_percentage: "12",
  squad_activity_threshold_percent: "50",
  squad_max_bonus_percent: "0",
  dzp_default_activity: "0",
  dzp_ad_reward: "1",
  dzp_referral_reward: "0",
  system_enabled: "true",
  adsgram_block_id: "",
  updates_channel_url: ""
});

let pool = null;
let cache = new Map(Object.entries(DEFAULTS));
let cacheAt = 0;
let refreshPromise = null;
let refreshTimer = null;

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

function invalidate() {
  cacheAt = 0;
}

function getCached(key, fallback = DEFAULTS[key] ?? "") {
  return cache.has(key) ? cache.get(key) : String(fallback);
}

function getCachedNumber(key, fallback = Number(DEFAULTS[key] ?? 0)) {
  const value = Number(getCached(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function getCachedWholeNumber(key, fallback = Number(DEFAULTS[key] ?? 0)) {
  const value = getCachedNumber(key, fallback);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function getCachedBoolean(key, fallback = String(DEFAULTS[key]).toLowerCase() === "true") {
  const value = String(getCached(key, fallback ? "true" : "false")).toLowerCase();
  return value === "true" ? true : value === "false" ? false : fallback;
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

function startAutoRefresh(intervalMs = 2000) {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    refresh(true).catch(error => console.error("Runtime settings refresh error:", error.message));
  }, Math.max(1000, Number(intervalMs) || 2000));
  if (typeof refreshTimer.unref === "function") refreshTimer.unref();
}

async function close() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  if (pool) await pool.end();
  pool = null;
}

module.exports = {
  DEFAULTS,
  refresh,
  invalidate,
  get,
  getNumber,
  getWholeNumber,
  getBoolean,
  getCached,
  getCachedNumber,
  getCachedWholeNumber,
  getCachedBoolean,
  startAutoRefresh,
  close
};
