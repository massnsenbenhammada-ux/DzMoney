"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "server.js");
let source = fs.readFileSync(file, "utf8");

function replaceExact(from, to, label) {
  const count = source.split(from).length - 1;
  if (count === 0) throw new Error(`Migration blocker: expected ${label} was not found.`);
  if (count > 1) throw new Error(`Migration blocker: ${label} occurs ${count} times; refusing ambiguous rewrite.`);
  source = source.replace(from, to);
}

if (!source.includes('require("./runtime-settings-service")')) {
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
if (source.includes(fixedRateBlock)) {
  replaceExact(fixedRateBlock, "", "legacy fixed-rate overwrite block");
}

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

const startBlock = `    await initDatabase();\n    console.log("PostgreSQL schema/settings/tasks: OK");`;
if (source.includes(startBlock)) {
  replaceExact(
    startBlock,
    `    await initDatabase();\n    await runtimeSettings.refresh(true);\n    runtimeSettings.startAutoRefresh(2000);\n    console.log("PostgreSQL schema/settings/tasks: OK");\n    console.log("Runtime settings service: ENABLED");`,
    "server runtime settings startup"
  );
}

if (source === fs.readFileSync(file, "utf8")) {
  throw new Error("Migration produced no changes; refusing a no-op commit.");
}

fs.writeFileSync(file, source);
console.log("Safe server runtime-settings migration applied.");
