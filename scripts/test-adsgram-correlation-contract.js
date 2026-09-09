const assert = require("assert");
const fs = require("fs");
const path = require("path");
const client = fs.readFileSync(
  path.join(__dirname, "..", "public", "adsgram-adapter-entry.js"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(__dirname, "..", "src", "http", "adsgram-reward-routes.js"),
  "utf8",
);
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const config = fs.readFileSync(
  path.join(__dirname, "..", "src", "config", "adsgram.js"),
  "utf8",
);
const correlation = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src",
    "services",
    "adsgram-correlation-service.js",
  ),
  "utf8",
);
const task = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src",
    "services",
    "task-advertisement-service.js",
  ),
  "utf8",
);
const provider = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "adsgram-adapter.js"),
  "utf8",
);
assert.match(client, /result\.providerId === 'adsgram'/);
assert.match(client, /providerId === 'monetag'/);
assert.match(client, /client-complete/);
assert.match(client, /controller\.show\(\)/);
assert.match(client, /event\.stopImmediatePropagation\(\)/);
assert.match(route, /req\.query\?\.userid/);
assert.doesNotMatch(route, /ADSGRAM_REWARD_TOKEN/);
assert.doesNotMatch(config, /ADSGRAM_REWARD_TOKEN/);
assert.strictEqual(
  (route.match(/router\.get\(/g) || []).length,
  1,
  "AdsGram Reward URL router must expose exactly one GET callback route",
);
assert.strictEqual(
  (server.match(/app\.use\('\/api\/ads\/adsgram\/reward'/g) || []).length,
  1,
  "server must mount exactly one AdsGram Reward URL callback",
);
assert.doesNotMatch(
  server,
  /app\.use\('\/api\/ads\/adsgram\/(?!reward)/,
  "server must not mount another AdsGram callback path",
);
assert.match(route, /pendingClientConfirmation/);
assert.match(
  correlation,
  /No started AdsGram advertisement matches the provider callback/,
);
assert.match(correlation, /context IN \('task','squad'\)/);
assert.match(correlation, /client_completed/);
assert.match(correlation, /provider_confirmed/);
assert.match(
  correlation,
  /client_completed === true && state\.provider_confirmed === true/,
);
assert.match(task, /adsgram-pending/);
assert.match(task, /hasPendingAdsGramEvent/);
assert.match(task, /context IN \('task','squad'\)/);
assert.match(
  task,
  /Pending AdsGram event requires an available Monetag provider/,
);
assert.match(task, /AdsGram advertisement is already pending for this user/);
assert.match(task, /adsgram_block_id/);
assert.match(provider, /contexts: ADSGRAM_CONTEXTS/);
assert.match(provider, /const ADSGRAM_CONTEXTS = \['task', 'squad'\]/);
console.log("AdsGram correlation contract: PASS");
