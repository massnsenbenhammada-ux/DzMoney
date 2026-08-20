const assert = require('node:assert/strict');
const {
  TON_DZX,
  TON_COIN,
  DZX_COIN,
  DZP_COIN,
  DZP_DZX,
  tonToDZX,
  dzxToTON,
} = require('../src/services/economy-service');

// Finalized Phase 1 economy relationships:
// 1 TON = 10,000 DZX = 10,000,000 COIN
// 1 DZX = 1,000 COIN
// 1 DZP = 10 DZX = 10,000 COIN
assert.equal(TON_DZX, 10000);
assert.equal(TON_COIN, 10000000);
assert.equal(DZX_COIN, 1000);
assert.equal(DZP_COIN, 10000);
assert.equal(DZP_DZX, 10);

assert.equal(tonToDZX(1), 10000);
assert.equal(tonToDZX(0.2), 2000);
assert.equal(dzxToTON(10000), 1);
assert.equal(dzxToTON(2000), 0.2);
assert.equal(10000 * DZX_COIN, TON_COIN);
assert.equal(DZP_DZX * DZX_COIN, DZP_COIN);

assert.throws(() => tonToDZX(0));
assert.throws(() => dzxToTON(0));

console.log('Phase 1 economy invariants: PASS');
