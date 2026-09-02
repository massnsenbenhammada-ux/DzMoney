const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, DIGGING_BOARD, SPIN_WEIGHTS, simulate } = require('./simulate-gaming-economy');

test('Gaming simulation uses the requested 1,000 users / 30 days baseline', () => {
  const result = simulate({ seed: 54 });
  assert.equal(result.users, 1000);
  assert.equal(result.days, 30);
  assert.equal(result.activities, 600000);
  assert.equal(result.spinAds, 3000000);
  assert.equal(result.diggingAds, 3000000);
  assert.equal(result.energyUsed, 80000);
});

test('Spin and Digging simulation inputs remain non-negative and auditable', () => {
  for (const [, weight] of SPIN_WEIGHTS) assert.equal(Number.isInteger(weight) && weight >= 0, true);
  assert.equal(DIGGING_BOARD.length, 16);
  assert.equal(DIGGING_BOARD.filter(result => result === 'none').length, 10);
  assert.equal(DIGGING_BOARD.filter(result => result === 'extraAxe').length, 1);
  const result = simulate({ seed: 54 });
  assert.equal(result.coin >= 0, true);
  assert.equal(result.dzx >= 0, true);
  assert.equal(result.dzp >= 0, true);
  assert.equal(result.dzxEquivalent >= 0, true);
});

test('Simulation is deterministic for a fixed seed', () => {
  assert.deepEqual(simulate({ seed: 54 }), simulate({ seed: 54 }));
});

test('Simulation configuration exposes assumptions instead of hard-coding production state', () => {
  assert.equal(DEFAULTS.users, 1000);
  assert.equal(DEFAULTS.days, 30);
  assert.equal(DEFAULTS.dailyEnergy, 3);
  assert.equal(DEFAULTS.spinAdsPerDay, 100);
  assert.equal(DEFAULTS.diggingAdsPerDay, 100);
});
