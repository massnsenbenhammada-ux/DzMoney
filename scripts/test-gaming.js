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
  assert(migration.includes('gaming_resource_claims'));
  assert(migration.includes('"dailyAdLimit":100'));
  assert(migration.includes('"boardSize":16'));
  assert(migration.includes('"energy":3'));
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
  assert.throws(() => validateGamingConfig({ ...valid, adBonus:{coin_100:-1} }), /non-negative integers/);
}

function testSourceBoundaries() {
  const service = fs.readFileSync(require.resolve('../src/services/gaming-service.js'), 'utf8');
  assert(service.includes("source:'gaming'"));
  assert(service.includes('gaming:spin:'));
  assert(service.includes('gaming:digging:'));
  assert(service.includes('gaming:ad:'));
  assert(service.includes('FOR UPDATE'));
}

try {
  testProviderContext();
  testConfigContract();
  testConfigValidation();
  testSourceBoundaries();
  require('./simulate-gaming-economy').run();
  console.log('Gaming core invariants: PASS');
} catch (error) {
  console.error('Gaming core invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
