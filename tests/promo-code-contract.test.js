const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Phase 10 migration defines canonical promo campaigns and redemptions", () => {
  const migration = fs.readFileSync(
    path.join(root, "migrations/047_promo_codes.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS promo_campaigns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS promo_redemptions/);
  assert.match(
    migration,
    /reward_currency TEXT NOT NULL CHECK \(reward_currency IN \('COIN', 'DZX'\)\)/,
  );
  assert.match(
    migration,
    /ad_event_id BIGINT UNIQUE REFERENCES activity_ad_events/,
  );
  assert.match(migration, /code TEXT NOT NULL UNIQUE/);
});

test("Promo service exposes redeem and finalization boundaries", () => {
  const service = require("../src/services/promo-code-service");
  assert.equal(typeof service.redeemPromoCode, "function");
  assert.equal(typeof service.finalizePromoRedemption, "function");
  assert.equal(typeof service.listPromoCampaigns, "function");
  assert.equal(typeof service.createPromoCampaign, "function");
  assert.equal(typeof service.updatePromoCampaign, "function");
  assert.equal(service.normalizePromoCode(" dz-2026 "), "DZ-2026");
  assert.throws(
    () => service.normalizePromoCode("bad code"),
    /Invalid promo code/,
  );
});

test("Promo reward validation only permits COIN or DZX", () => {
  const { normalizeReward } = require("../src/services/promo-code-service");
  assert.deepEqual(
    normalizeReward({ rewardCurrency: "coin", rewardAmount: "1000" }),
    { currency: "COIN", amount: "1000" },
  );
  assert.deepEqual(
    normalizeReward({ rewardCurrency: "DZX", rewardAmount: "2.5" }),
    { currency: "DZX", amount: "2.5" },
  );
  assert.throws(
    () => normalizeReward({ rewardCurrency: "DZP", rewardAmount: 1 }),
    /reward currency/,
  );
  assert.throws(
    () => normalizeReward({ rewardCurrency: "COIN", rewardAmount: 0 }),
    /positive/,
  );
});

test("Promo routes are mounted and protected by Telegram/admin authentication boundaries", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const routes = fs.readFileSync(
    path.join(root, "src/http/promo-code-routes.js"),
    "utf8",
  );
  const adminRoutes = fs.readFileSync(
    path.join(root, "src/http/admin-promo-code-routes.js"),
    "utf8",
  );
  assert.match(server, /require\('\.\/src\/http\/promo-code-routes'\)/);
  assert.match(server, /app\.use\('\/api\/promo'/);
  assert.match(server, /require\('\.\/src\/http\/admin-promo-code-routes'\)/);
  assert.match(server, /app\.use\('\/api\/admin\/promo'/);
  assert.match(routes, /router\.use\(auth\)/);
  assert.doesNotMatch(routes, /router\.post\('\/finalize'/);
  assert.match(adminRoutes, /router\.use\(adminAuth\)/);
});

test("Promo advertisement is an explicit provider context and never a task verification event", () => {
  const provider = fs.readFileSync(
    path.join(root, "src/services/ad-provider-service.js"),
    "utf8",
  );
  const event = fs.readFileSync(
    path.join(root, "src/services/ad-event-service.js"),
    "utf8",
  );
  const monetag = fs.readFileSync(
    path.join(root, "src/config/monetag.js"),
    "utf8",
  );
  const onclicka = fs.readFileSync(
    path.join(root, "src/config/onclicka.js"),
    "utf8",
  );
  const monetagPostback = fs.readFileSync(
    path.join(root, "src/http/monetag-postback-routes.js"),
    "utf8",
  );
  const onclickaPostback = fs.readFileSync(
    path.join(root, "src/http/onclicka-postback-routes.js"),
    "utf8",
  );
  assert.match(provider, /'promo'/);
  assert.match(event, /'promo'/);
  assert.match(monetag, /MONETAG_PROMO_CONTEXT/);
  assert.match(onclicka, /'promo'/);
  assert.match(monetagPostback, /context === 'promo'/);
  assert.match(onclickaPostback, /context === 'promo'/);
});

test("Home contains the Phase 10 promo code entry point", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const promo = fs.readFileSync(
    path.join(root, "public/promo-code.js"),
    "utf8",
  );
  assert.match(html, /id="promoCodeInput"/);
  assert.match(html, /id="promoCodeButton"/);
  assert.match(html, /promo-code\.js\?v=__ASSET_VERSION__/);
  assert.match(promo, /promoCodeButton/);
});
