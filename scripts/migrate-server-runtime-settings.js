"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "server.js");
const original = fs.readFileSync(file, "utf8");
let source = original;

function replaceExact(from, to, label) {
  const count = source.split(from).length - 1;
  if (count === 0) throw new Error(`Migration blocker: expected ${label} was not found.`);
  if (count > 1) throw new Error(`Migration blocker: ${label} occurs ${count} times; refusing ambiguous rewrite.`);
  source = source.replace(from, to);
}

// 1) Canonical runtime settings service.
if (!source.includes('const runtimeSettings = require("./runtime-settings-service");')) {
  replaceExact(
    'const nacl = require("tweetnacl");',
    'const nacl = require("tweetnacl");\nconst runtimeSettings = require("./runtime-settings-service");',
    "server runtime-settings import"
  );
}

if (source.includes('const ECONOMY = Object.freeze({\n  BUX_PER_TON: 10000,\n  COINS_PER_BUX: 100\n});')) {
  replaceExact(
    'const ECONOMY = Object.freeze({\n  BUX_PER_TON: 10000,\n  COINS_PER_BUX: 100\n});',
    'const ECONOMY = Object.freeze({\n  get BUX_PER_TON() { return runtimeSettings.getCachedNumber("bux_per_ton", 10000); },\n  get COINS_PER_BUX() { return runtimeSettings.getCachedNumber("coins_per_bux", 100); }\n});',
    "legacy ECONOMY constants"
  );
}

const fixedRateBlock = `  // Fixed DzMoney economy: never allow legacy settings to change these rates.\n  await pool.query(\n    \`INSERT INTO settings (key,value,updated_at)\n     VALUES ('coins_per_bux',$1,$2)\n     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=$2\`,\n    [String(ECONOMY.COINS_PER_BUX), Date.now()]\n  );\n  await pool.query(\n    \`INSERT INTO settings (key,value,updated_at)\n     VALUES ('bux_per_ton',$1,$2)\n     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=$2\`,\n    [String(ECONOMY.BUX_PER_TON), Date.now()]\n  );\n`;
if (source.includes(fixedRateBlock)) replaceExact(fixedRateBlock, "", "legacy fixed-rate overwrite block");

const getSettingLegacy = `async function getSettingValue(key, fallback = "") {\n  if (key === "coins_per_bux") return String(ECONOMY.COINS_PER_BUX);\n  if (key === "bux_per_ton") return String(ECONOMY.BUX_PER_TON);\n\n  const result = await pool.query(\n    "SELECT value FROM settings WHERE key=$1 LIMIT 1",\n    [key]\n  );\n  return result.rowCount ? String(result.rows[0].value) : fallback;\n}`;
if (source.includes(getSettingLegacy)) {
  replaceExact(
    getSettingLegacy,
    `async function getSettingValue(key, fallback = "") {\n  return runtimeSettings.get(key, fallback);\n}`,
    "legacy settings reader"
  );
}

const dailyCooldown = `    const cooldown = 24 * 60 * 60 * 1000;`;
if (source.includes(dailyCooldown)) {
  replaceExact(
    dailyCooldown,
    `    const cooldownSeconds = await runtimeSettings.getWholeNumber("daily_reward_cooldown_seconds", 86400);\n    const cooldown = cooldownSeconds * 1000;`,
    "hardcoded daily cooldown"
  );
}

const dailyRewards = `    const coinsReward = 1000;\n    const buxReward = 1;`;
if (source.includes(dailyRewards)) {
  replaceExact(
    dailyRewards,
    `    const coinsReward = await runtimeSettings.getWholeNumber("daily_reward_coins", 1000);\n    const buxReward = await runtimeSettings.getWholeNumber("daily_reward_bux", 1);`,
    "hardcoded daily reward"
  );
}

// 2) The legacy /api/admin/settings handler must not reject canonical economy
// keys. The canonical Admin v2 router is installed first, but keeping the
// fallback handler compatible prevents route-order regressions.
const settingsRouteStart = 'app.put("/api/admin/settings", requireAdmin, async (req, res) => {';
const routeIndex = source.indexOf(settingsRouteStart);
if (routeIndex >= 0) {
  const routeEnd = source.indexOf('\n});', routeIndex);
  if (routeEnd < 0) throw new Error("Migration blocker: cannot locate end of legacy admin settings route.");
  const route = source.slice(routeIndex, routeEnd + 4);
  const oldAllowed = /const allowedSettings = new Set\(\[[\s\S]*?\]\);/;
  if (oldAllowed.test(route)) {
    const allowed = `const allowedSettings = new Set([\n      "daily_reward_coins","daily_reward_bux","daily_reward_cooldown_seconds",\n      "minimum_withdraw_bux","withdrawal_fee_bux","daily_ads_limit","daily_ad_task_count",\n      "daily_task_reward_coins","daily_task_reward_dzx","minimum_withdrawal_coins",\n      "bux_per_ton","coins_per_bux","dzx_per_ton","coins_per_dzx","coins_per_ton",\n      "minimum_deposit_ton","minimum_withdrawal_ton","withdrawal_fee_dzx",\n      "referral_percentage","squad_activity_threshold_percent","squad_max_bonus_percent",\n      "dzp_default_activity","dzp_ad_reward","dzp_referral_reward",\n      "daily_reward_ad_separate","system_enabled","adsgram_block_id","updates_channel_url"\n    ]);`;
    const nextRoute = route.replace(oldAllowed, allowed);
    source = source.slice(0, routeIndex) + nextRoute + source.slice(routeEnd + 4);
  }

  source = source.replace(
    /\n\s*if \(key === "coins_per_bux" \|\| key === "bux_per_ton"\)[\s\S]*?\n\s*\}/,
    ""
  );
}

// 3) Runtime settings are loaded before any request can use them and refreshed
// in the background so Admin changes propagate without restarting Railway.
if (!source.includes('runtimeSettings.startAutoRefresh(2000);')) {
  const startBlock = `    await initDatabase();\n    console.log("PostgreSQL schema/settings/tasks: OK");`;
  if (source.includes(startBlock)) {
    replaceExact(
      startBlock,
      `    await initDatabase();\n    await runtimeSettings.refresh(true);\n    runtimeSettings.startAutoRefresh(2000);\n    console.log("PostgreSQL schema/settings/tasks: OK");\n    console.log("Runtime settings service: ENABLED");`,
      "server runtime settings startup"
    );
  }
}

if (source !== original) {
  fs.writeFileSync(file, source);
  console.log("Safe server runtime-settings migration applied.");
} else {
  console.log("Safe server runtime-settings migration already applied; no changes needed.");
}
