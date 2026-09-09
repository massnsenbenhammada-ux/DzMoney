const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "migrations/044_squad_ads_task.sql"),
  "utf8",
);
const contextMigration = fs.readFileSync(
  path.join(root, "migrations/046_squad_ad_event_context.sql"),
  "utf8",
);
const squadRoutes = fs.readFileSync(
  path.join(root, "src/http/squad-routes.js"),
  "utf8",
);
const squadFrontend = fs.readFileSync(
  path.join(root, "public/squad.js"),
  "utf8",
);
const adClient = fs.readFileSync(
  path.join(root, "public/ad-provider-client.js"),
  "utf8",
);
const taskRoutes = fs.readFileSync(
  path.join(root, "src/http/task-routes.js"),
  "utf8",
);
const advertisementService = fs.readFileSync(
  path.join(root, "src/services/task-advertisement-service.js"),
  "utf8",
);
const correlation = fs.readFileSync(
  path.join(root, "src/services/adsgram-correlation-service.js"),
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
const dailyRoutes = fs.readFileSync(
  path.join(root, "src/http/daily-system-task-routes.js"),
  "utf8",
);

const squadAdsRoute = squadRoutes.slice(
  squadRoutes.search(/router\.get\(["']\/ads["']/),
  squadRoutes.search(/router\.get\(["']\/membership-tiers["']/),
);

assert.match(migration, /systemKey":\s*["']squad_ads/);
assert.match(migration, /advertisementTarget":10/);
assert.match(migration, /advertisementContext":\s*["']squad/);
assert.match(migration, /placement":\s*["']squad/);
assert.doesNotMatch(migration, /"completion"/);
assert.match(
  contextMigration,
  /DROP CONSTRAINT IF EXISTS activity_ad_events_context_check/,
);
assert.match(
  contextMigration,
  /context IN \('task', 'reward_pool', 'daily_checkin', 'verification', 'gaming', 'squad'\)/,
);
assert.match(squadAdsRoute, /router\.get\(["']\/ads["']/);
assert.doesNotMatch(squadAdsRoute, /router\.post\(["']\/ads\/start["']/);
assert.match(squadAdsRoute, /context\s*=\s*["']squad["']/);
assert.doesNotMatch(squadAdsRoute, /squad_memberships/);
assert.doesNotMatch(squadAdsRoute, /membership/);
assert.doesNotMatch(squadAdsRoute, /Valid Squad membership is required/);
assert.match(squadFrontend, /\/api\/tasks\/advertisement\/start/);
assert.doesNotMatch(squadFrontend, /\/api\/squad\/ads\/start/);
assert.match(squadFrontend, /requestVar: ["']squad["']/);
assert.match(squadFrontend, /response\.providerId === ["']adsgram["']/);
assert.match(
  squadFrontend,
  /\/api\/daily-tasks\/advertisement\/client-started/,
);
assert.match(
  squadFrontend,
  /\/api\/daily-tasks\/advertisement\/client-complete/,
);
assert.match(squadFrontend, /onStart/);
assert.match(adClient, /registerAdsgram/);
assert.match(adClient, /providerAdapters\.adsgram/);
assert.match(adClient, /window\.Adsgram\.init/);
assert.match(adClient, /addEventListener\(["']onStart["']/);
assert.match(adClient, /44442/);
assert.match(dailyRoutes, /adsgram\s*=\s*adsgramCorrelation/);
assert.match(dailyRoutes, /adsgram\.markClientStarted/);
assert.match(dailyRoutes, /adsgram\.markClientCompleted/);
assert.match(
  taskRoutes,
  /tasksList\.filter\(task => task\.systemKey !== ["']squad_ads["']\)/,
);
assert.match(taskRoutes, /externalAdId: result\.adEvent\?\.external_ad_id/);
assert.match(
  advertisementService,
  /config\.advertisementContext \|\| ["']task["']/,
);
assert.match(advertisementService, /context IN \(["']task["'],["']squad["']\)/);
assert.match(advertisementService, /squad_ads.*config\.systemKey/);
assert.match(advertisementService, /client_started/);
assert.doesNotMatch(advertisementService, /squad_memberships/);
assert.doesNotMatch(advertisementService, /Valid Squad membership is required/);
assert.match(correlation, /markClientStarted/);
assert.match(correlation, /client_started === true/);
assert.match(correlation, /AdsGram advertisement has not started/);
assert.match(
  correlation,
  /client_started === true && state\.client_completed === true && state\.provider_confirmed === true/,
);
assert.match(
  monetagPostback,
  /taskAdvertisementService\.finalizeTaskAdvertisement/,
);
assert.match(
  onclickaPostback,
  /taskAdvertisementService\.finalizeTaskAdvertisement/,
);
assert.doesNotMatch(monetagPostback, /finalizeStandardAdvertisement/);
assert.doesNotMatch(onclickaPostback, /finalizeStandardAdvertisement/);

console.log("Squad Ads contract: PASS");
