const assert = require('assert');
const fs = require('fs');
const { query } = require('../src/db/pool');
const { validateGamingConfig } = require('../src/services/gaming-service');
const { AD_PROVIDER_CONTEXTS } = require('../src/services/ad-provider-service');
const { run: simulateGamingEconomy } = require('./simulate-gaming-economy');
const { spawnSync } = require('child_process');

function testProviderContext() {
  assert(AD_PROVIDER_CONTEXTS.includes('gaming'));
  assert(!AD_PROVIDER_CONTEXTS.includes('reward_pool'));
}

function testConfigContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/038_gaming.sql'), 'utf8');
  const resetMigration = fs.readFileSync(
    require.resolve('../migrations/043_gaming_daily_board_reset.sql'),
    'utf8',
  );
  const correction = fs.readFileSync(
    require.resolve('../migrations/042_gaming_activity_contract.sql'),
    'utf8',
  );
  assert(migration.includes('gaming_config_versions'));
  assert(migration.includes('gaming_accounts'));
  assert(migration.includes('gaming_sessions'));
  assert(/"dailyAdLimit"\s*:\s*100/.test(migration));
  assert(/"boardSize"\s*:\s*16/.test(migration));
  assert(/"energy"\s*:\s*3/.test(migration));
  assert(correction.includes('RENAME COLUMN activity_claimed TO verified_activity_count'));
  assert(correction.includes("status='closed'"));
  assert(correction.includes("'diggingAxeEveryAds'"));
  assert(resetMigration.includes("'active','completed','expired'"));
  assert(resetMigration.includes('gaming_sessions_status_check'));
}

function testGamingTaskContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/039_gaming_tasks.sql'), 'utf8');
  assert(migration.includes('"gamingResource":"spin"'));
  assert(migration.includes('"gamingResource":"axe"'));
  assert(migration.includes('"mode":"advertisement"'));
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
  assert.throws(() => validateGamingConfig({ ...valid, dailyAdLimit: 0 }), /positive integer/);
  assert.throws(
    () => validateGamingConfig({ ...valid, adBonus: { coin_100: -1 } }),
    /Gaming reward weights are invalid/,
  );
}

function testSourceBoundaries() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  const economy = fs.readFileSync(require.resolve('../src/services/economy-service.js'), 'utf8');
  const verification = fs.readFileSync(
    require.resolve('../src/services/task-verification-service.js'),
    'utf8',
  );
  const routes = fs.readFileSync(require.resolve('../src/http/gaming-routes.js'), 'utf8');
  const onclickaRoutes = fs.readFileSync(
    require.resolve('../src/http/onclicka-postback-routes.js'),
    'utf8',
  );
  const adminRoutes = fs.readFileSync(
    require.resolve('../src/http/admin-gaming-routes.js'),
    'utf8',
  );
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert(service.includes("source: 'gaming'"));
  assert(service.includes('gaming:spin:'));
  assert(service.includes('gaming:digging:'));
  assert(service.includes('gaming:ad:'));
  assert(service.includes('recordVerifiedActivityOnClient'));
  assert(service.includes('startRotatedAdvertisementEventOnClient'));
  assert(!service.includes('selectProvider'));
  assert(service.includes("const gamingDaySql = \"(NOW() AT TIME ZONE 'UTC' + INTERVAL '1 hour')::date\""));
  assert(service.includes("status='expired'"));
  assert(service.includes('expireStaleDiggingSession'));
  assert(service.includes("created_at AT TIME ZONE 'UTC' + INTERVAL '1 hour'"));
  assert(!verification.includes('grantGamingResourceOnClient'));
  assert(!verification.includes('row.config.gamingResource'));
  assert(routes.includes('function publicSession(session)'));
  assert(routes.includes('publicGamingState(await gaming.getGamingState({ userId }))'));
  assert(routes.includes('const providerId = event.rows[0].metadata?.provider_id'));
  assert(routes.includes('finalizeGamingAdvertisement'));
  assert(routes.includes('reward: result.reward || null'));
  assert(routes.includes('resourceGranted: result.resourceGranted || null'));
  assert(routes.includes('progress: result.progress ?? null'));
  assert(!routes.includes("providerId: 'gigapub'"));
  assert(onclickaRoutes.includes('const CONTEXTS = new Set(['));
  assert(onclickaRoutes.includes("'gaming'"));
  assert(onclickaRoutes.includes('taskAdvertisementService.verifyTrustedTaskAdvertisement'));
  assert(onclickaRoutes.includes("router.get('/', handlePostback)"));
  assert(onclickaRoutes.includes('const context = event.context'));
  assert(adminRoutes.includes('router.use(adminAuth)'));
  assert(adminRoutes.includes("router.put('/config'"));
  assert(adminRoutes.includes('actorTelegramUserId: req.adminTelegramUserId'));
  assert(server.includes("app.use('/api/admin/gaming', createAdminGamingRouter());"));
  assert(
    server.includes(
      "app.use('/api/ads/onclicka', createOnclickaPostbackRouter({ providerRegistry }));",
    ),
  );
  assert(service.includes('postEconomyTransactionOnClient'));
  assert(service.includes("type: 'GAMING_REWARD'"));
  assert(economy.includes('postEconomyTransactionOnClient'));
  assert(economy.includes('idempotencyKey'));
}

function testRewardTables() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  for (const key of ['coin_100', 'coin_1000', 'dzx_1', 'dzx_10', 'dzp_1', 'dzp_10', 'extra_spin'])
    assert(service.includes(key));
  for (const key of ['coin_100', 'coin_1000', 'dzx_1', 'dzx_10', 'dzp_1', 'dzp_10', 'extra_axe'])
    assert(service.includes(key));
  assert(service.includes("bonus === 'coin_100' ? { coin: 100 } : { dzx: 1 }"));
  assert(service.includes('diggingAxeEveryAds'));
}

function testGamingFrontendContract() {
  const gaming = fs.readFileSync('public/gaming.js', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const css = fs.readFileSync('public/gaming.css', 'utf8');
  const html = fs.readFileSync('public/index.html', 'utf8');
  const adClient = fs.readFileSync('public/ad-provider-client.js', 'utf8');
  const monetagEntry = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
  const onclickaLoader = fs.readFileSync('public/onclicka-sdk-loader.js', 'utf8');
  const onclickaEntry = fs.readFileSync('public/onclicka-adapter-entry.js', 'utf8');
  const gigapubEntry = fs.readFileSync('public/gigapub-adapter-entry.js', 'utf8');
  assert(gaming.includes('data-spin-wheel'));
  assert(gaming.includes('data-spin-wheel-segment'));
  assert(gaming.includes('data-digging-image'));
  assert(gaming.includes('<svg'));
  assert(gaming.includes('data-spin-result'));
  assert(gaming.includes('DzMoneyAdClient.getProvider(providerId)'));
  assert(gaming.includes('formatGamingAdFailure(providerId, stage, error)'));
  assert(gaming.includes('let providerId = null;'));
  assert(gaming.includes("let stage = 'start';"));
  assert(gaming.includes("stage = 'ready';"));
  assert(gaming.includes("stage = 'show';"));
  assert(gaming.includes("stage = 'complete';"));
  assert(gaming.includes('const labelAngle = index * segment - 90;'));
  assert(gaming.includes('const rotation = 360 * 3 - labelAngle;'));
  assert(!gaming.includes('360 * 3 - index * segment - segment / 2'));
  assert(gaming.includes('formatDiggingStatus'));
  assert(gaming.includes('No spins left — watch an ad or complete a task to get more.'));
  assert(gaming.includes("Use an Axe to start today\\'s board."));
  assert(gaming.includes("No more digs today — come back tomorrow."));
  assert(gaming.includes("Today\\'s board:"));
  assert(!gaming.includes('gaming-runtime.css'));
  assert(!gaming.includes('ensureGamingRuntimeStyles'));
  assert(gaming.includes("if (result === 'none') return 'No reward this time.'"));
  assert(gaming.includes("if (result === 'extra_spin') return '+1 Spin.'"));
  assert(gaming.includes('renderRewardLists'));
  assert(gaming.includes("const response = await api('/api/gaming/ads/start'"));
  assert(
    gaming.includes(
      "await adapter.handler({ requestVar: 'gaming', adEventId: response.adEventId, ymid: response.externalAdId })",
    ),
  );
  assert(
    !gaming.includes(
      "await adapter.handler({ requestVar: 'gaming', adEventId: response.adEventId })",
    ),
  );
  assert(!gaming.includes('const startPromise = api'));
  assert(!gaming.includes('const adPromise = adapter.handler'));
  assert(!gaming.includes('Promise.all([startPromise, adPromise])'));
  assert(!gaming.includes('setTimeout(resolve, 1500)'));
  assert(gaming.includes('showRewardOutcome'));
  assert(/showRewardOutcome\(completion\)/.test(gaming));
  assert(gaming.includes('await load();'));
  assert(gaming.includes('completion.duplicate'));
  assert(app.includes('function showRewardOutcome(result, fallbackTask = null)'));
  assert(app.includes('result?.reward'));
  assert(app.includes('Reward credited'));
  assert(app.includes('Reward not credited'));
  assert(css.includes('conic-gradient'));
  assert(css.includes('color-mix(in srgb,var(--primary)'));
  assert(css.includes('45deg'));
  assert(css.includes('@container'));
  assert(css.includes(':has('));
  assert(css.includes('min-height:32px'));
  assert(!fs.existsSync('public/gaming-runtime.css'));
  assert(html.includes('Gaming Ads'));
  assert(html.includes('data-gaming-ad="spin"'));
  assert(html.includes('data-gaming-ad="digging"'));
  assert(html.includes('/monetag-adapter-entry.js?v=__ASSET_VERSION__'));
  assert(!html.includes('/monetag-adapter.bundle.js?v=__ASSET_VERSION__'));
  assert(adClient.includes('providerAdapters'));
  assert(adClient.includes('getProvider(providerId)'));
  assert(adClient.includes('registerOnclicka'));
  assert(monetagEntry.includes('show_11627577'));
  assert(onclickaLoader.includes('preloadOnclicka'));
  assert(onclickaLoader.includes('DOMContentLoaded'));
  assert(!onclickaLoader.includes('setTimeout(preloadOnclicka, 0)'));
  assert(onclickaLoader.includes('DzMoneyOnclicka?.prepare'));
  assert(onclickaEntry.includes('prepare: ({ spotId } = {}) => ensureOnclickaReady(spotId)'));
  assert(gigapubEntry.includes('providers?.gigapub'));
  const configMarker = '<script>window.__DzMoneyAdProviderConfig=__AD_PROVIDER_CONFIG__;</script>';
  const providerEntryMarkers = [
    '<script src="/monetag-adapter-entry.js?v=__ASSET_VERSION__">',
    '<script src="/onclicka-sdk-loader.js?v=__ASSET_VERSION__">',
    '<script src="/onclicka-adapter-entry.js?v=__ASSET_VERSION__">',
    '<script src="/gigapub-adapter-entry.js?v=__ASSET_VERSION__">',
  ];
  const configIndex = html.indexOf(configMarker);
  assert(configIndex >= 0, 'Provider config bootstrap marker is missing');
  for (const marker of providerEntryMarkers) {
    const providerIndex = html.indexOf(marker);
    assert(providerIndex >= 0, `Provider bootstrap marker is missing: ${marker}`);
    assert(configIndex < providerIndex, `Provider config must load before ${marker}`);
  }
}

async function testEconomicConfig() {
  const result = await query(
    'SELECT config FROM gaming_config_versions ORDER BY version DESC LIMIT 1',
  );
  assert.strictEqual(result.rowCount, 1);
  const config = result.rows[0].config;
  const expectedSpinOrder = [
    'none',
    'coin_100',
    'extra_spin',
    'coin_1000',
    'dzx_1',
    'dzp_1',
    'dzx_10',
    'dzp_10',
  ];
  const expectedDiggingOrder = [
    'none',
    'coin_100',
    'extra_axe',
    'coin_1000',
    'dzx_1',
    'dzp_1',
    'dzx_10',
    'dzp_10',
  ];
  for (const [weights, order] of [
    [config.spin.weights, expectedSpinOrder],
    [config.digging.weights, expectedDiggingOrder],
  ]) {
    assert(order.every(key => Object.prototype.hasOwnProperty.call(weights, key)));
    for (let i = 1; i < order.length; i += 1) assert(weights[order[i - 1]] > weights[order[i]]);
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
  console.log('Gaming provider/context invariants: PASS');
  console.log('Gaming canonical Economy/Ledger reward contract: PASS');
  console.log('Gaming reward popup + balance synchronization contract: PASS');
  console.log('Gaming canonical wheel/daily-board contract: PASS');
  console.log('Gaming economic configuration simulation: PASS');

  const integration = spawnSync(
    process.execPath,
    [require.resolve('./test-onclicka-gaming-callback.js')],
    { stdio: 'inherit', env: process.env },
  );
  assert.strictEqual(integration.status, 0, 'Gaming provider/economic integration test must pass');
  const dailyReset = spawnSync(
    process.execPath,
    [require.resolve('./test-gaming-daily-reset.js')],
    { stdio: 'inherit', env: process.env },
  );
  assert.strictEqual(dailyReset.status, 0, 'Gaming daily reset integration test must pass');
  console.log('Gaming provider/economic integration: PASS');
  console.log('Gaming daily-board reset integration: PASS');
}

run().catch(error => {
  console.error('Gaming core invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
