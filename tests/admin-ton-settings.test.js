'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTonAddress,
  assertAddressNetwork,
} = require('../src/services/admin-settings-service');

const MAINNET = 'UQAaRNqn01vjTzDdSaN8LtsWpZRWkhRQZkXCNzfb3z0ZDeI0';
const TESTNET = 'kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwM';

test('accepts the configured Mainnet address format and network', () => {
  const address = normalizeTonAddress(MAINNET);
  assert.equal(address, MAINNET);
  assert.doesNotThrow(() => assertAddressNetwork(address, 'mainnet'));
});

test('rejects cross-network TON addresses', () => {
  assert.throws(() => assertAddressNetwork(MAINNET, 'testnet'), /does not match testnet/);
  assert.throws(() => assertAddressNetwork(TESTNET, 'mainnet'), /does not match mainnet/);
});

test('rejects malformed TON addresses', () => {
  assert.throws(() => normalizeTonAddress('UQA-invalid'), /Invalid TON user-friendly address/);
  assert.throws(() => normalizeTonAddress('EQ123'), /Invalid TON user-friendly address/);
});
