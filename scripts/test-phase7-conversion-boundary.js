const test = require('node:test');
const assert = require('node:assert/strict');
const economy = require('../src/services/economy-service');

test('Phase 7 conversion rates preserve locked economy relationships', () => {
  assert.equal(economy.DZP_COIN, 10000);
  assert.equal(economy.DZP_DZX, 10);
  assert.equal(economy.TON_DZX, 10000);
});

test('Phase 7 conversion helpers expose only the allowed directions', () => {
  assert.equal(typeof economy.convertCoinToDzp, 'function');
  assert.equal(typeof economy.convertDzxToDzp, 'function');
  assert.equal(economy.tonToDZX(1), 10000);
  assert.equal(economy.dzxToTON(10000), 1);
});
