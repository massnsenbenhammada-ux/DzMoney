const assert = require('assert');
const fs = require('fs');
const { query } = require('../src/db/pool');
const { validateGamingConfig } = require('../src/services/gaming-service');
const { AD_PROVIDER_CONTEXTS } = require('../src/services/ad-provider-service');
const { run: simulateGamingEconomy } = require('./simulate-gaming-economy');

function testProviderContext() {
  assert(AD_PROVIDER_CONTEXTS.includes('gaming'));
  assert(!AD_PROVIDER_CONTEXTS.includes('reward_pool'));
}

function testConfigContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/038_gaming.sql'), 'utf8');
  const correction = fs.readFileSync(require.resolve('../migrations/042_gaming_activity_contract.sql'), 'utf8');
  assert(migration.includes('gaming_config_versions'));
  assert(migration.includes('gaming_accounts'));
  assert(migration.includes('gaming_sessions'));
  assert(/"dailyAdLimit"\s*:\s*100/.test(migration));
  assert(/"boardSize"\s*:\s*16/.test(migration));
  assert(/"energy"\s*:\s*3/.test(migration));
  assert(correction.includes('RENAME COLUMN activity_claimed TO verified_activity_count'));
  assert(correction.includes("status='closed'"));
  assert(correction.includes("'diggingAxeEveryAds'"));
}

function testGamingTaskContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/039_gaming_tasks.sql'), 'utf8');
  assert(migration.includes('"gamingResource":"spin"'));
  assert(migration.includes('"gamingResource":"axe"'));
  assert(migration.includes('"mode":"advertisement"'));
}

function testConfigValidation() {
  const valid = {
    enabled:true,dailyAdLimit:100,diggingAxeEveryAds:10,
    spin:{weights:{none:10,coin_1000:1}},
    digging:{boardSize:16,energy:3,weights:{none:10,coin_1000:1}},
    adBonus:{coin_100:95,dzx_1:5}
  };
  assert.strictEqual(validateGamingConfig(valid), valid);
  assert.throws(() => validateGamingConfig({ ...valid, dailyAdLimit:0 }), /positive integer/);
  assert.throws(() => validateGamingConfig({ ...valid, adBonus:{coin_100:-1} }), /Gaming reward weights are invalid/);
}

function testSourceBoundaries() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  const economy = fs.readFileSync(require.resolve('../src/services/economy-service.js'), 'utf8');
  const verification = fs.readFileSync(require.resolve('../src/services/task-verification-service.js'), 'utf8');
  const routes = fs.readFileSync(require.resolve('../src/http/gaming-routes.js'), 'utf8');
  const onclickaRoutes = fs.readFileSync(require.resolve('../src/http/onclicka-postback-routes.js'), 'utf8');
  const adminRoutes = fs.readFileSync(require.resolve('../src/http/admin-gaming-routes.js'), 'utf8');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert(service.includes("source: 'gaming'"));
  assert(service.includes('gaming:spin:'));
  assert(service.includes('gaming:digging:'));
  assert(service.includes('gaming:ad:'));
  assert(service.includes('recordVerifiedActivityOnClient'));
  assert(service.includes('requiredId(actorTelegramUserId'));
  assert(!service.includes('dailyActivityLimit'));
  assert(economy.includes('qualifyingVerifiedActivity && !transaction.duplicate'));
  assert(economy.includes('recordVerifiedActivityOnClient'));
  assert(!verification.includes('grantGamingResourceOnClient'));
  assert(!verification.includes('row.config.gamingResource'));
  assert(routes.includes('function publicSession(session)'));
  assert(routes.includes('publicGamingState(await gaming.getGamingState({ userId }))'));
  assert(onclickaRoutes.includes("const CONTEXTS = new Set(['task', 'daily_checkin', 'verification', 'gaming'])"));
  assert(onclickaRoutes.includes('taskAdvertisementService.verifyTrustedTaskAdvertisement'));
  assert(onclickaRoutes.includes('router.get(\'/\', handlePostback)'));
  assert(onclickaRoutes.includes('const context = event.context'));
  assert(adminRoutes.includes('router.use(adminAuth)'));
  assert(adminRoutes.includes("router.put('/config'"));
  assert(adminRoutes.includes('actorTelegramUserId: req.adminTelegramUserId'));
  assert(server.includes("app.use('/api/admin/gaming', createAdminGamingRouter());"));
}

function testRewardTables() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  for (const key of ['coin_100','coin_1000','dzx_1','dzx_10','dzp_1','dzp_10','extra_spin']) assert(service.includes(key));
  for (const key of ['coin_100','coin_1000','dzx_1','dzx_10','dzp_1','dzp_10','extra_axe']) assert(service.includes(key));
  assert(service.includes("bonus === 'coin_100' ? { coin: 100 } : { dzx: 1 }"));
  assert(service.includes('diggingAxeEveryAds'));
}

function testGamingFrontendContract() {
  const gaming = fs.readFileSync('public/gaming.js', 'utf8');
  const css = fs.readFileSync('public/gaming.css', 'utf8');
  const runtimeCss = fs.readFileSync('public/gaming-runtime.css', 'utf8');
  const html = fs.readFileSync('public/index.html', 'utf8');
  const adClient = fs.readFileSync('public/ad-provider-client.js', 'utf8');
  const onclickaLoader = fs.readFileSync('public/onclicka-sdk-loader.js', 'utf8');

  assert(gaming.includes('data-spin-wheel'));
  assert(gaming.includes('data-spin-wheel-segment'));
  assert(gaming.includes('data-digging-image'));
  assert(gaming.includes('<svg'));
  assert(gaming.includes('data-spin-result'));
  assert(gaming.includes('DzMoneyGamingAd'));
  assert(gaming.includes('No advertisement provider is configured'));
  assert(gaming.includes('adapter?.ready'));
  assert(gaming.includes("if (result === 'extra_spin') return '+1 SPIN'"));
  assert(gaming.includes("if (result === 'extra_axe') return '+1 AXE'"));
  assert(gaming.includes('360 * 3 - index * segment'));
  assert(gaming.includes("const wheelResults = ['coin_100'"));
  assert(gaming.includes('renderRewardLists'));
  assert(gaming.includes('gaming-runtime.css'));
  assert(gaming.includes('assetVersion'));
  assert(css.includes('conic-gradient'));
  assert(css.includes('45deg'));
  assert(css.includes('@container'));
  assert(css.includes(':has('));
  assert(runtimeCss.includes('dzmoney-wheel-three-turns'));
  assert(runtimeCss.includes('data-spin-wheel-segment="coin_100"'));
  assert(runtimeCss.includes('transform-origin: 50% 50%'));
  assert(runtimeCss.includes('translateY(-88px)'));
  assert(runtimeCss.includes('rotate(calc(var(--i, 0) * -45deg + 90deg))'));
  assert(!runtimeCss.includes('translateX(-74%)'));
  assert(html.includes('Gaming Ads'));
  assert(html.includes('data-gaming-ad="spin"'));
  assert(html.includes('data-gaming-ad="digging"'));
  assert(adClient.includes('DzMoneyOnclicka.show'));
  assert(adClient.includes("gamingProvider?.id === 'monetag' && window.DzMoneyMonetag?.ready"));
  assert(adClient.includes("provider: 'monetag'"));
  assert(onclickaLoader.includes('preloadSelectedOnclicka'));
  assert(onclickaLoader.includes('setTimeout(preloadSelectedOnclicka, 0)'));
}

async function testEconomicConfig() {
  const result = await query('SELECT config FROM gaming_config_versions ORDER BY version DESC LIMIT 1');
  assert.strictEqual(result.rowCount, 1);
  const config = result.rows[0].config;
  const expectedSpinOrder = ['none','coin_100','extra_spin','coin_1000','dzx_1','dzp_1','dzx_10','dzp_10'];
  const expectedDiggingOrder = ['none','coin_100','extra_axe','coin_1000','dzx_1','dzp_1','dzx_10','dzp_10'];
  for (const [weights, order] of [[config.spin.weights, expectedSpinOrder], [config.digging.weights, expectedDiggingOrder]]) {
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
  console.log('Gaming core invariants: PASS');
}

run().catch(error => {
  console.error('Gaming core invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});
