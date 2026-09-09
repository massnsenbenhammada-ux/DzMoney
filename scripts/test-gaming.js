const assert = require("assert");
const fs = require("fs");
const { query } = require("../src/db/pool");
const { validateGamingConfig } = require("../src/services/gaming-service");
const { AD_PROVIDER_CONTEXTS } = require("../src/services/ad-provider-service");
const { run: simulateGamingEconomy } = require("./simulate-gaming-economy");
const { spawnSync } = require("child_process");

function sourceContains(source, fragment) {
  const normalize = (value) => value.replace(/[\s'\"]/g, "");
  return normalize(source).includes(normalize(fragment));
}

function testProviderContext() {
  assert(AD_PROVIDER_CONTEXTS.includes("gaming"));
  assert(!AD_PROVIDER_CONTEXTS.includes("reward_pool"));
}

function testConfigContract() {
  const migration = fs.readFileSync(
    require.resolve("../migrations/038_gaming.sql"),
    "utf8",
  );
  const correction = fs.readFileSync(
    require.resolve("../migrations/042_gaming_activity_contract.sql"),
    "utf8",
  );
  assert(sourceContains(migration, "gaming_config_versions"));
  assert(sourceContains(migration, "gaming_accounts"));
  assert(sourceContains(migration, "gaming_sessions"));
  assert(/"dailyAdLimit"\s*:\s*100/.test(migration));
  assert(/"boardSize"\s*:\s*16/.test(migration));
  assert(/"energy"\s*:\s*3/.test(migration));
  assert(
    sourceContains(
      correction,
      "RENAME COLUMN activity_claimed TO verified_activity_count",
    ),
  );
  assert(sourceContains(correction, "status='closed'"));
  assert(sourceContains(correction, "'diggingAxeEveryAds'"));
}

function testGamingTaskContract() {
  const migration = fs.readFileSync(
    require.resolve("../migrations/039_gaming_tasks.sql"),
    "utf8",
  );
  assert(sourceContains(migration, '"gamingResource":"spin"'));
  assert(sourceContains(migration, '"gamingResource":"axe"'));
  assert(sourceContains(migration, '"mode":"advertisement"'));
}

function testConfigValidation() {
  const valid = {
    enabled: true,
    dailyAdLimit: 100,
    diggingAxeEveryAds: 10,
    spin: { weights: { none: 10, coin_1000: 1 } },
    digging: { boardSize: 16, energy: 3, weights: { none: 10, coin_1000: 1 } },
    adBonus: { coin_100: 95, dzx_1: 5 },
  };
  assert.strictEqual(validateGamingConfig(valid), valid);
  assert.throws(
    () => validateGamingConfig({ ...valid, dailyAdLimit: 0 }),
    /positive integer/,
  );
  assert.throws(
    () => validateGamingConfig({ ...valid, adBonus: { coin_100: -1 } }),
    /Gaming reward weights are invalid/,
  );
}

function testSourceBoundaries() {
  const service = fs.readFileSync(
    require.resolve("../src/services/gaming-service.js"),
    "utf8",
  );
  const economy = fs.readFileSync(
    require.resolve("../src/services/economy-service.js"),
    "utf8",
  );
  const verification = fs.readFileSync(
    require.resolve("../src/services/task-verification-service.js"),
    "utf8",
  );
  const routes = fs.readFileSync(
    require.resolve("../src/http/gaming-routes.js"),
    "utf8",
  );
  const onclickaRoutes = fs.readFileSync(
    require.resolve("../src/http/onclicka-postback-routes.js"),
    "utf8",
  );
  const adminRoutes = fs.readFileSync(
    require.resolve("../src/http/admin-gaming-routes.js"),
    "utf8",
  );
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  assert(sourceContains(service, "source: 'gaming'"));
  assert(sourceContains(service, "gaming:spin:"));
  assert(sourceContains(service, "gaming:digging:"));
  assert(sourceContains(service, "gaming:ad:"));
  assert(sourceContains(service, "recordVerifiedActivityOnClient"));
  assert(sourceContains(service, "startRotatedAdvertisementEventOnClient"));
  assert(!sourceContains(service, "selectProvider"));
  assert(!sourceContains(verification, "grantGamingResourceOnClient"));
  assert(!sourceContains(verification, "row.config.gamingResource"));
  assert(sourceContains(routes, "function publicSession(session)"));
  assert(
    sourceContains(
      routes,
      "publicGamingState(await gaming.getGamingState({ userId }))",
    ),
  );
  assert(
    sourceContains(
      routes,
      "const providerId = event.rows[0].metadata?.provider_id",
    ),
  );
  assert(sourceContains(routes, "finalizeGamingAdvertisement"));
  assert(sourceContains(routes, "reward: result.reward || null"));
  assert(
    sourceContains(routes, "resourceGranted: result.resourceGranted || null"),
  );
  assert(sourceContains(routes, "progress: result.progress ?? null"));
  assert(!sourceContains(routes, "providerId: 'gigapub'"));
  assert(sourceContains(onclickaRoutes, "const CONTEXTS = new Set(["));
  assert(sourceContains(onclickaRoutes, "'gaming'"));
  assert(
    sourceContains(
      onclickaRoutes,
      "taskAdvertisementService.verifyTrustedTaskAdvertisement",
    ),
  );
  assert(sourceContains(onclickaRoutes, "router.get('/', handlePostback)"));
  assert(sourceContains(onclickaRoutes, "const context = event.context"));
  assert(sourceContains(adminRoutes, "router.use(adminAuth)"));
  assert(sourceContains(adminRoutes, "router.put('/config'"));
  assert(
    sourceContains(adminRoutes, "actorTelegramUserId: req.adminTelegramUserId"),
  );
  assert(
    sourceContains(
      server,
      "app.use('/api/admin/gaming', createAdminGamingRouter());",
    ),
  );
  assert(
    sourceContains(
      server,
      "app.use('/api/ads/onclicka', createOnclickaPostbackRouter({ providerRegistry })",
    ),
  );
  assert(sourceContains(service, "postEconomyTransactionOnClient"));
  assert(sourceContains(service, "type: 'GAMING_REWARD'"));
  assert(sourceContains(economy, "postEconomyTransactionOnClient"));
  assert(sourceContains(economy, "idempotencyKey"));
}

function testRewardTables() {
  const service = fs.readFileSync(
    require.resolve("../src/services/gaming-service.js"),
    "utf8",
  );
  for (const key of [
    "coin_100",
    "coin_1000",
    "dzx_1",
    "dzx_10",
    "dzp_1",
    "dzp_10",
    "extra_spin",
  ])
    assert(sourceContains(service, key));
  for (const key of [
    "coin_100",
    "coin_1000",
    "dzx_1",
    "dzx_10",
    "dzp_1",
    "dzp_10",
    "extra_axe",
  ])
    assert(sourceContains(service, key));
  assert(
    sourceContains(
      service,
      "bonus === 'coin_100' ? { coin: 100 } : { dzx: 1 }",
    ),
  );
  assert(sourceContains(service, "diggingAxeEveryAds"));
}

function testGamingFrontendContract() {
  const gaming = fs.readFileSync("public/gaming.js", "utf8");
  const app = fs.readFileSync("public/app.js", "utf8");
  const css = fs.readFileSync("public/gaming.css", "utf8");
  const runtimeCss = fs.readFileSync("public/gaming-runtime.css", "utf8");
  const html = fs.readFileSync("public/index.html", "utf8");
  const adClient = fs.readFileSync("public/ad-provider-client.js", "utf8");
  const monetagEntry = fs.readFileSync(
    "public/monetag-adapter-entry.js",
    "utf8",
  );
  const onclickaLoader = fs.readFileSync(
    "public/onclicka-sdk-loader.js",
    "utf8",
  );
  const onclickaEntry = fs.readFileSync(
    "public/onclicka-adapter-entry.js",
    "utf8",
  );
  const gigapubEntry = fs.readFileSync(
    "public/gigapub-adapter-entry.js",
    "utf8",
  );
  assert(sourceContains(gaming, "data-spin-wheel"));
  assert(sourceContains(gaming, "data-spin-wheel-segment"));
  assert(sourceContains(gaming, "data-digging-image"));
  assert(sourceContains(gaming, "<svg"));
  assert(sourceContains(gaming, "data-spin-result"));
  assert(sourceContains(gaming, "DzMoneyAdClient.getProvider(providerId)"));
  assert(
    sourceContains(gaming, "formatGamingAdFailure(providerId, stage, error)"),
  );
  assert(sourceContains(gaming, "let providerId = null;"));
  assert(sourceContains(gaming, "let stage = 'start';"));
  assert(sourceContains(gaming, "stage = 'ready';"));
  assert(sourceContains(gaming, "stage = 'show';"));
  assert(sourceContains(gaming, "stage = 'complete';"));
  assert(
    sourceContains(gaming, "if (result === 'extra_spin') return '+1 SPIN'"),
  );
  assert(sourceContains(gaming, "if (result === 'extra_axe') return '+1 AXE'"));
  assert(sourceContains(gaming, "360 * 3 - index * segment"));
  assert(sourceContains(gaming, "const wheelResults = ['coin_100'"));
  assert(sourceContains(gaming, "renderRewardLists"));
  assert(sourceContains(gaming, "gaming-runtime.css"));
  assert(sourceContains(gaming, "assetVersion"));
  assert(
    sourceContains(
      gaming,
      "const response = await api('/api/gaming/ads/start'",
    ),
  );
  assert(
    sourceContains(
      gaming,
      "await adapter.handler({ requestVar: 'gaming', adEventId: response.adEventId, ymid: response.externalAdId })",
    ),
  );
  assert(
    !sourceContains(
      gaming,
      "await adapter.handler({ requestVar: 'gaming', adEventId: response.adEventId })",
    ),
  );
  assert(!sourceContains(gaming, "const startPromise = api"));
  assert(!sourceContains(gaming, "const adPromise = adapter.handler"));
  assert(!sourceContains(gaming, "Promise.all([startPromise, adPromise])"));
  assert(!sourceContains(gaming, "setTimeout(resolve, 1500)"));
  assert(sourceContains(gaming, "showRewardOutcome"));
  assert(/showRewardOutcome\(completion\)/.test(gaming));
  assert(sourceContains(gaming, "await load();"));
  assert(sourceContains(gaming, "completion.duplicate"));
  assert(
    sourceContains(
      app,
      "function showRewardOutcome(result, fallbackTask = null)",
    ),
  );
  assert(sourceContains(app, "result?.reward"));
  assert(sourceContains(app, "Reward credited"));
  assert(sourceContains(app, "Reward not credited"));
  assert(sourceContains(css, "conic-gradient"));
  assert(sourceContains(css, "45deg"));
  assert(sourceContains(css, "@container"));
  assert(sourceContains(css, ":has("));
  assert(sourceContains(runtimeCss, "dzmoney-wheel-three-turns"));
  assert(sourceContains(runtimeCss, 'data-spin-wheel-segment="coin_100"'));
  assert(sourceContains(runtimeCss, "transform-origin: 50% 50%"));
  assert(sourceContains(runtimeCss, "translateY(-88px)"));
  assert(
    sourceContains(runtimeCss, "rotate(calc(var(--i, 0) * -45deg + 90deg))"),
  );
  assert(!sourceContains(runtimeCss, "translateX(-74%)"));
  assert(sourceContains(html, "Gaming Ads"));
  assert(sourceContains(html, 'data-gaming-ad="spin"'));
  assert(sourceContains(html, 'data-gaming-ad="digging"'));
  assert(sourceContains(html, "/monetag-adapter-entry.js?v=__ASSET_VERSION__"));
  assert(
    !sourceContains(html, "/monetag-adapter.bundle.js?v=__ASSET_VERSION__"),
  );
  assert(sourceContains(adClient, "providerAdapters"));
  assert(sourceContains(adClient, "getProvider(providerId)"));
  assert(sourceContains(adClient, "registerOnclicka"));
  assert(sourceContains(monetagEntry, "show_11627577"));
  assert(sourceContains(onclickaLoader, "preloadOnclicka"));
  assert(sourceContains(onclickaLoader, "DOMContentLoaded"));
  assert(!sourceContains(onclickaLoader, "setTimeout(preloadOnclicka, 0)"));
  assert(sourceContains(onclickaLoader, "DzMoneyOnclicka?.prepare"));
  assert(
    sourceContains(
      onclickaEntry,
      "prepare: ({ spotId } = {}) => ensureOnclickaReady(spotId)",
    ),
  );
  assert(sourceContains(gigapubEntry, "providers?.gigapub"));
  const configMarker =
    "<script>window.__DzMoneyAdProviderConfig=__AD_PROVIDER_CONFIG__;</script>";
  const providerEntryMarkers = [
    '<script src="/monetag-adapter-entry.js?v=__ASSET_VERSION__">',
    '<script src="/onclicka-sdk-loader.js?v=__ASSET_VERSION__">',
    '<script src="/onclicka-adapter-entry.js?v=__ASSET_VERSION__">',
    '<script src="/gigapub-adapter-entry.js?v=__ASSET_VERSION__">',
  ];
  const configIndex = html.indexOf(configMarker);
  assert(configIndex >= 0, "Provider config bootstrap marker is missing");
  for (const marker of providerEntryMarkers) {
    const providerIndex = html.indexOf(marker);
    assert(
      providerIndex >= 0,
      `Provider bootstrap marker is missing: ${marker}`,
    );
    assert(
      configIndex < providerIndex,
      `Provider config must load before ${marker}`,
    );
  }
}

async function testEconomicConfig() {
  const result = await query(
    "SELECT config FROM gaming_config_versions ORDER BY version DESC LIMIT 1",
  );
  assert.strictEqual(result.rowCount, 1);
  const config = result.rows[0].config;
  const expectedSpinOrder = [
    "none",
    "coin_100",
    "extra_spin",
    "coin_1000",
    "dzx_1",
    "dzp_1",
    "dzx_10",
    "dzp_10",
  ];
  const expectedDiggingOrder = [
    "none",
    "coin_100",
    "extra_axe",
    "coin_1000",
    "dzx_1",
    "dzp_1",
    "dzx_10",
    "dzp_10",
  ];
  for (const [weights, order] of [
    [config.spin.weights, expectedSpinOrder],
    [config.digging.weights, expectedDiggingOrder],
  ]) {
    assert(
      order.every((key) => Object.prototype.hasOwnProperty.call(weights, key)),
    );
    for (let i = 1; i < order.length; i += 1)
      assert(weights[order[i - 1]] > weights[order[i]]);
  }
  simulateGamingEconomy(config);
}

async function run() {
  testProviderContext();
  testConfigContract();
  testGamingTaskContract();
  testConfigValidation();
  testSourceBoundaries();
  testRewardTables();
  testGamingFrontendContract();
  await testEconomicConfig();
  console.log("Gaming provider/context invariants: PASS");
  console.log("Gaming canonical Economy/Ledger reward contract: PASS");
  console.log("Gaming reward popup + balance synchronization contract: PASS");
  console.log("Gaming economic configuration simulation: PASS");

  const integration = spawnSync(
    process.execPath,
    [require.resolve("./test-onclicka-gaming-callback.js")],
    { stdio: "inherit", env: process.env },
  );
  assert.strictEqual(
    integration.status,
    0,
    "Gaming provider/economic integration test must pass",
  );
  console.log("Gaming provider/economic integration: PASS");
}

run().catch((error) => {
  console.error("Gaming core invariants: FAIL");
  console.error(error);
  process.exitCode = 1;
});
