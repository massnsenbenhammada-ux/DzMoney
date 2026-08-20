"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "public", "admin.html"), "utf8");
const runtime = fs.readFileSync(path.join(root, "runtime-settings-service.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "scripts", "migrate-server-runtime-settings.js"), "utf8");

const failures = [];
const obsolete = [
  "admin-dashboard-control.js",
  "admin-economy-control.js",
  "admin-settings-compat.js",
  "admin-settings-contract.js",
  "admin-settings-finalizer.js",
  "admin-task-catalog-control.js",
  "admin-ui-route-bridge.js",
  "runtime-settings-bridge.js",
  "public/admin-v2.js",
  "public/admin-dashboard.js",
  "public/admin-economy-ui.js",
  "public/admin-live-refresh.js",
  "public/admin-settings-save-fix.js",
  "public/admin-state-fix.js",
  "public/task-ads-ui.js"
];
for (const file of obsolete) {
  if (fs.existsSync(path.join(root, file))) failures.push(`obsolete file still present: ${file}`);
}

const requiredAdminSections = ["dashboard","users","tasks","economy","activity","referral","withdrawals","system","audit"];
for (const section of requiredAdminSections) {
  if (!admin.includes(`'${section}'`) && !admin.includes(`\"${section}\"`)) {
    failures.push(`Admin section missing: ${section}`);
  }
}

for (const required of [
  'require("./runtime-settings-service")',
  'runtimeSettings.getCachedNumber("bux_per_ton", 10000)',
  'runtimeSettings.getCachedNumber("coins_per_bux", 100)',
  'runtimeSettings.getWholeNumber("daily_reward_coins", 1000)',
  'runtimeSettings.getWholeNumber("daily_reward_bux", 1)',
  'runtimeSettings.getWholeNumber("daily_reward_cooldown_seconds", 86400)',
  'runtimeSettings.startAutoRefresh(2000)'
]) {
  if (!server.includes(required)) failures.push(`server runtime-settings contract missing: ${required}`);
}

for (const required of [
  "async function refresh",
  "async function getNumber",
  "async function getWholeNumber",
  "function getCachedNumber",
  "function getCachedWholeNumber",
  "function startAutoRefresh"
]) {
  if (!runtime.includes(required)) failures.push(`runtime-settings-service capability missing: ${required}`);
}

for (const required of [
  '"dzx_per_ton"',
  '"coins_per_dzx"',
  '"coins_per_ton"',
  '"bux_per_ton"',
  '"coins_per_bux"',
  '"daily_reward_coins"',
  '"daily_reward_bux"',
  '"daily_reward_cooldown_seconds"',
  '"referral_percentage"',
  '"system_enabled"'
]) {
  if (!migration.includes(required)) failures.push(`migration does not cover Admin setting: ${required}`);
}

// These are forbidden as runtime policy definitions. Fallback values inside
// runtime-settings-service are allowed; the application must consume the DB
// value through the service instead of defining its own economic rule.
const forbiddenRuntimePatterns = [
  /const\s+ECONOMY\s*=\s*Object\.freeze\s*\(\s*\{[\s\S]*?BUX_PER_TON\s*:\s*10000[\s\S]*?COINS_PER_BUX\s*:\s*100/s,
  /const\s+coinsReward\s*=\s*1000\s*;/,
  /const\s+buxReward\s*=\s*1\s*;/,
  /const\s+cooldown\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\s*;/,
  /if\s*\(key\s*===\s*["']coins_per_bux["']\)\s*return\s+String\(ECONOMY\.COINS_PER_BUX\)/,
  /if\s*\(key\s*===\s*["']bux_per_ton["']\)\s*return\s+String\(ECONOMY\.BUX_PER_TON\)/
];
for (const pattern of forbiddenRuntimePatterns) {
  if (pattern.test(server)) failures.push(`server.js still contains a forbidden hardcoded runtime rule: ${pattern}`);
}

if (failures.length) {
  console.error("ADMIN SAFE AUDIT FAILED");
  for (const failure of failures) console.error("-", failure);
  process.exit(1);
}

console.log("ADMIN SAFE AUDIT PASSED");
