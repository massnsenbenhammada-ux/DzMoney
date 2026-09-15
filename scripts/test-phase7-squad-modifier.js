const assert = require('node:assert/strict');

function modifierRate(contribution) {
  const value = Number(contribution);
  if (!Number.isFinite(value) || value < 0) throw new Error('Contribution must be non-negative');
  return String(Math.sqrt(value) / 100);
}

function applyModifier(base, rate) {
  return base * (1 + Number(rate));
}

assert.equal(modifierRate(0), '0');
assert.equal(modifierRate(10000), '1');
assert.equal(Number(modifierRate(75000)).toFixed(6), '2.738613');
assert.equal(Number(modifierRate(100000)).toFixed(6), '3.162278');
assert.equal(Number(modifierRate(500000)).toFixed(6), '7.071068');

for (const [a, b] of [[0, 1], [1, 4], [100, 101], [10000, 10001], [75000, 75001]]) {
  assert.ok(Number(modifierRate(b)) >= Number(modifierRate(a)));
}

const deltaAtLow = Math.sqrt(10001) - Math.sqrt(10000);
const deltaAtHigh = Math.sqrt(500001) - Math.sqrt(500000);
assert.ok(deltaAtHigh < deltaAtLow);

assert.equal(applyModifier(100, '1'), 200);
assert.equal(applyModifier(100, modifierRate(75000)), 373.8612787525831);

console.log('Phase 7 modifier formula tests passed');
