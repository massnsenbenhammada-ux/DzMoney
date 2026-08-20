/*
 * DzMoney runtime settings bridge.
 *
 * This file deliberately does NOT change the Admin UI. It makes the values
 * saved by Admin effective in the running backend, including legacy code in
 * server.js that still contains historical constants.
 *
 * The bridge is temporary compatibility infrastructure: it reads PostgreSQL
 * settings and adjusts the legacy SQL parameters at the point where rewards
 * and coin conversion are persisted. It also prevents server startup from
 * overwriting admin-controlled economy rates.
 */
const pg = require("pg");

const OriginalPoolQuery = pg.Pool.prototype.query;
const cache = Object.create(null);
let lastRefresh = 0;
let refreshPromise = null;

function numberSetting(key, fallback) {
  const value = Number(cache[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function refreshSettings(pool) {
  const now = Date.now();
  if (now - lastRefresh < 1500) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const result = await OriginalPoolQuery.call(
        pool,
        "SELECT key,value FROM settings WHERE key = ANY($1)",
        [[
          "coins_per_bux",
          "bux_per_ton",
          "daily_reward_coins",
          "daily_reward_bux",
          "minimum_withdraw_bux",
          "withdrawal_fee_bux",
          "daily_ads_limit",
          "referral_percentage",
          "system_enabled"
        ]]
      );
      for (const row of result.rows || []) cache[row.key] = row.value;
      lastRefresh = Date.now();
    } catch (_) {
      // Settings table does not exist during the very first CREATE TABLE query.
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function cloneParams(params) {
  return Array.isArray(params) ? params.slice() : params;
}

pg.Pool.prototype.query = function dzmoneyRuntimeQuery(config, values, callback) {
  const sql = typeof config === "string" ? config : (config && config.text) || "";
  const originalValues = typeof config === "string" ? values : (config && config.values);
  const upper = String(sql).replace(/\s+/g, " ").trim().toUpperCase();

  const relevant =
    upper.includes("UPDATE USERS SET COINS=COINS+$1") ||
    upper.includes("DAILY_CLAIM_AT=$3") ||
    upper.includes("INSERT INTO SETTINGS") ||
    upper.includes("UPDATE SETTINGS");

  if (!relevant) return OriginalPoolQuery.apply(this, arguments);

  return refreshSettings(this).then(() => {
    let nextValues = cloneParams(originalValues);

    // server.js historically forces these two values back into settings during
    // startup. Never overwrite a value chosen by the administrator.
    if (
      upper.includes("INSERT INTO SETTINGS") &&
      upper.includes("ON CONFLICT (KEY) DO UPDATE SET VALUE=$1") &&
      Array.isArray(nextValues) &&
      (String(nextValues[0]) === "100" || String(nextValues[0]) === "10000")
    ) {
      return { __dzSkip: true };
    }

    if (Array.isArray(nextValues)) {
      // Daily reward endpoint: [coins, bux, timestamp, userId].
      if (upper.includes("DAILY_CLAIM_AT=$3") && nextValues.length >= 4) {
        nextValues[0] = Math.trunc(numberSetting("daily_reward_coins", Number(nextValues[0]) || 1000));
        nextValues[1] = Math.trunc(numberSetting("daily_reward_bux", Number(nextValues[1]) || 1));
      }

      // Task claim endpoint: [coins, rewardBux, userId]. The task reward is
      // already read from the tasks table, so only the coin conversion belongs
      // here.
      if (
        upper.includes("UPDATE USERS SET COINS=COINS+$1, BUX=BUX+$2") &&
        upper.includes("WHERE ID=$3") &&
        nextValues.length >= 3
      ) {
        const buxReward = Number(nextValues[1]);
        const coinsPerBux = numberSetting("coins_per_bux", 100);
        if (Number.isFinite(buxReward) && buxReward >= 0) {
          nextValues[0] = Math.trunc(buxReward * coinsPerBux);
        }
      }
    }

    if (typeof config === "string") {
      if (nextValues && nextValues.__dzSkip) return { rows: [], rowCount: 0 };
      return OriginalPoolQuery.call(this, config, nextValues, callback);
    }

    const nextConfig = Object.assign({}, config, { values: nextValues });
    return OriginalPoolQuery.call(this, nextConfig, callback);
  }).then(result => {
    if (result && result.__dzSkip) return { rows: [], rowCount: 0 };
    return result;
  });
};

global.__dzRuntimeSettings = {
  cache,
  refresh: () => {
    // The actual pool is not available here; it is refreshed automatically on
    // the next relevant query.
    lastRefresh = 0;
  },
  get(key, fallback) {
    return numberSetting(key, fallback);
  }
};

console.log("DzMoney runtime settings bridge: ENABLED");
