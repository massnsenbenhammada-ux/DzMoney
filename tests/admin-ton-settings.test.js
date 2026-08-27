'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTonAddress,
  assertAddressNetwork,
  decodeTonAddress,
} = require('../src/services/admin-settings-service');

const MAINNET = 'UQAaRNqn01vjTzDdSaN8LtsWpZRWkhRQZkXCNzfb3z0ZDeI0';
const TESTNET = 'kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwM';

test('accepts the configured Mainnet address and verifies checksum', () => {
  const decoded = decodeTonAddress(MAINNET);
  assert.equal(decoded.tag, 0x51);
  assert.equal(decoded.workchain, 0);
  assert.equal(normalizeTonAddress(MAINNET), MAINNET);
  assert.doesNotThrow(() => assertAddressNetwork(MAINNET, 'mainnet'));
});

test('rejects cross-network TON addresses', () => {
  assert.throws(() => assertAddressNetwork(MAINNET, 'testnet'), /does not match testnet/);
  assert.throws(() => assertAddressNetwork(TESTNET, 'mainnet'), /does not match mainnet/);
});

test('rejects malformed TON addresses', () => {
  assert.throws(() => normalizeTonAddress('UQA-invalid'), /Invalid TON user-friendly address/);
  assert.throws(() => normalizeTonAddress('EQ123'), /Invalid TON user-friendly address/);
});

test('rejects a valid-length address with an invalid checksum', () => {
  const tampered = `${MAINNET.slice(0, -1)}${MAINNET.endsWith('0') ? '1' : '0'}`;
  assert.throws(() => normalizeTonAddress(tampered), /Invalid TON address checksum/);
});

test('accepts the supported Testnet tag only with valid checksum', () => {
  assert.doesNotThrow(() => assertAddressNetwork(TESTNET, 'testnet'));
  assert.throws(() => assertAddressNetwork(TESTNET, 'mainnet'), /does not match mainnet/);
});
