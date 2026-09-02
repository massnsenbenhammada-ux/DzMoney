const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

test('Phase 7 conversion UI uses a native dialog and live conversion preview', () => {
  const source = fs.readFileSync('public/conversion.js', 'utf8');
  const css = fs.readFileSync('public/conversion.css', 'utf8');
  assert.match(source, /document\.createElement\(['"]dialog['"]\)/);
  assert.match(source, /conversionPreview/);
  assert.match(source, /updatePreview/);
  assert.match(source, /BigInt/);
  assert.doesNotMatch(source, /document\.createElement\(['"]style['"]\)/);
  assert.match(css, /\.conversion-dialog::backdrop/);
  assert.match(css, /color-mix\(/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Phase 7 conversion preview enforces configured whole-DZP conversion units', () => {
  assert.equal(20000n % 10000n, 0n);
  assert.equal(25000n % 10000n, 5000n);
  assert.equal(200n % 10n, 0n);
  assert.equal(25n % 10n, 5n);
});
