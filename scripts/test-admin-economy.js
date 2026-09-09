const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(
  path.join(root, "src/http/admin-economy-routes.js"),
  "utf8",
);
const service = fs.readFileSync(
  path.join(root, "src/services/admin-settings-service.js"),
  "utf8",
);
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public/admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "public/admin.js"), "utf8");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("economy route reuses adminAuth", () => {
  assert.match(route, /require\(["']\.\/admin-auth["']\)/);
  assert.match(route, /router\.use\(adminAuth\)/);
});

test("economy service exposes only canonical Phase 12 rates", () => {
  for (const key of [
    "economy.dzx_per_ton",
    "economy.coin_per_dzp",
    "economy.dzx_per_dzp",
  ])
    assert.match(service, new RegExp(key.replaceAll(".", "\\.")));
  assert.doesNotMatch(service, /reward_pool\./);
});

test("economy writes require the authenticated admin actor and audit log", () => {
  assert.match(service, /setEconomySetting/);
  assert.match(service, /actorTelegramUserId/);
  assert.match(service, /admin_audit_log/);
});

test("server mounts the admin economy router", () => {
  assert.match(server, /createAdminEconomyRouter/);
  assert.match(server, /\/api\/admin\/economy/);
});

test("admin UI contains economy controls", () => {
  assert.match(html, /economySection/);
  for (const id of [
    "economyDZXPerTon",
    "economyCoinPerDZP",
    "economyDZXPerDZP",
  ])
    assert.match(html, new RegExp(id));
  assert.match(js, /\/api\/admin\/economy/);
});

test("test:all includes admin economy contract", () => {
  assert.equal(
    packageJson.scripts["test:admin-economy"],
    "node ./scripts/test-admin-economy.js",
  );
  assert.match(packageJson.scripts["test:all"], /test:admin-economy/);
});

console.log("Admin economy contract tests passed.");
