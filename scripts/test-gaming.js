const assert = require('assert');
const fs = require('fs');
const { validateGamingConfig } = require('../src/services/gaming-service');
const { AD_PROVIDER_CONTEXTS } = require('../src/services/ad-provider-service');

function testProviderContext() {
  assert(AD_PROVIDER_CONTEXTS.includes('gaming'));
  assert(!AD_PROVIDER_CONTEXTS.includes('reward_pool'));
}

function testConfigContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/038_gaming.sql'), 'utf8');
  assert(migration.includes('gaming_config_versions'));
  assert(migration.includes('gaming_accounts'));
  assert(migration.includes('gaming_sessions'));
  assert(/"dailyAdLimit"\s*:\s*100/.test(migration));
  assert(/"boardSize"\s*:\s*16/.test(migration));
  assert(/"energy"\s*:\s*3/.test(migration));
}

function testGamingTaskContract() {
  const migration = fs.readFileSync(require.resolve('../migrations/039_gaming_tasks.sql'), 'utf8');
  assert(migration.includes('"gamingResource":"spin"'));
  assert(migration.includes('"gamingResource":"axe"'));
  assert(migration.includes('"mode":"advertisement"'));
  assert(migration.includes("config->>'gamingResource'='spin'"));
  assert(migration.includes("config->>'gamingResource'='axe'"));
}

function testConfigValidation() {
  const valid = {
    enabled:true,dailyActivityLimit:20,dailyAdLimit:100,diggingAxeEveryAds:10,
    spin:{jackpotEnabled:true,jackpotRewardDzx:25,weights:{none:10,coin_100:1}},
    digging:{boardSize:16,energy:3,jackpotEnabled:false,jackpotRewardDzx:10,weights:{none:10,coin_100:1}},
    adBonus:{coin_100:95,dzx_1:5}
  };
  assert.strictEqual(validateGamingConfig(valid), valid);
  assert.throws(() => validateGamingConfig({ ...valid, dailyAdLimit:0 }), /positive integer/);
  assert.throws(() => validateGamingConfig({ ...valid, adBonus:{coin_100:-1} }), /Gaming reward weights are invalid/);
}

function testSourceBoundaries() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  assert(service.includes("source:'gaming'"));
  assert(service.includes('gaming:spin:'));
  assert(service.includes('gaming:digging:'));
  assert(service.includes('gaming:ad:'));
  assert(service.includes('FOR UPDATE'));
}

function testGamingFrontendContract() {
  const gaming = fs.readFileSync('public/gaming.js', 'utf8');
  const css = fs.readFileSync('public/gaming.css', 'utf8');
  const adClient = fs.readFileSync('public/ad-provider-client.js', 'utf8');

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
  assert(gaming.includes('360 * 5 - index * segment'));
  assert(css.includes('conic-gradient'));
  assert(css.includes('@container'));
  assert(css.includes(':has('));
  assert(adClient.includes('DzMoneyOnclicka.show'));
  assert(adClient.includes("gamingProvider?.id === 'monetag' && window.DzMoneyMonetag?.ready"));
  assert(adClient.includes("provider: 'monetag'"));
}

try {
  testProviderContext();
  testConfigContract();
  testGamingTaskContract();
  testConfigValidation();
  testSourceBoundaries();
  testGamingFrontendContract();
  require('./simulate-gaming-economy').run();
  console.log('Gaming core invariants: PASS');
} catch (error) {
  console.error('Gaming core invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
