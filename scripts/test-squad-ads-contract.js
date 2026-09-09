const assert = require("assert");
const fs = require("fs");

const advertisementService = fs.readFileSync(
  require.resolve("../src/services/task-advertisement-service.js"),
  "utf8",
);
const correlation = fs.readFileSync(
  require.resolve("../src/services/adsgram-ad-correlation-service.js"),
  "utf8",
);
const monetagPostback = fs.readFileSync(
  require.resolve("../src/http/monetag-postback-routes.js"),
  "utf8",
);
const squadRoutes = fs.readFileSync(
  require.resolve("../src/http/squad-routes.js"),
  "utf8",
);
const server = fs.readFileSync(require.resolve("../server.js"), "utf8");

assert.match(
  advertisementService,
  /config\.advertisementContext\s*\|\|\s*["']task["'] /,
);
assert.match(
  advertisementService,
  /context IN \(["']task["']\s*,\s*["']squad["']\)/,
);
assert.match(advertisementService, /squad_ads.*config\.systemKey/);
assert.match(advertisementService, /client_started/);
assert.doesNotMatch(advertisementService, /squad_memberships/);
assert.doesNotMatch(advertisementService, /Valid Squad membership is required/);
assert.match(correlation, /markClientStarted/);
assert.match(correlation, /client_started === true/);
assert.match(correlation, /AdsGram advertisement has not started/);
assert.match(
  correlation,
  /client_started === true\s*&&\s*state\.client_completed === true\s*&&\s*state\.provider_confirmed === true/,
);
assert.match(
  monetagPostback,
  /taskAdvertisementService\.finalizeTaskAdvertisement/,
);
assert.match(squadRoutes, /router\.post\(\s*["']\/ads\/start["']/);
assert.match(squadRoutes, /router\.post\(\s*["']\/ads\/complete["']/);
assert.match(squadRoutes, /router\.get\(\s*["']\/ads["']/);
assert.match(squadRoutes, /providerId/);
assert.match(squadRoutes, /adEventId/);
assert.match(server, /app\.use\(\s*["']\/api\/squad["']/);
assert.match(server, /createOnclickaPostbackRouter/);
console.log("Squad Ads source contract: PASS");
