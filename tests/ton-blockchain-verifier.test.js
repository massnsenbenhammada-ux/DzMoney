'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalAddress,
  tonToNano,
  assertTransactionHash,
  verifyTonDeposit,
} = require('../src/services/ton-blockchain-verifier');

const MAINNET = 'UQAaRNqn01vjTzDdSaN8LtsWpZRWkhRQZkXCNzfb3z0ZDeI0';
const RAW_MAINNET = '0:1a9a9e6f8e3b8c7a0d2f6f4f7c2c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8';
const TX_HASH = 'a'.repeat(64);

function response(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() { return payload; },
  };
}

function transaction({ value = '100000000', destination = RAW_MAINNET, account = RAW_MAINNET, bounced = false, aborted = false } = {}) {
  return {
    hash: TX_HASH,
    account,
    mc_block_seqno: 123,
    description: { aborted },
    in_msg: {
      destination,
      value,
      bounced,
    },
  };
}

test('converts TON decimal exactly to nanoTON', () => {
  assert.equal(tonToNano('0.1'), 100000000n);
  assert.equal(tonToNano('1'), 1000000000n);
  assert.equal(tonToNano('0.000000001'), 1n);
  assert.throws(() => tonToNano('0.0000000001'), /nanoTON precision/);
});

test('canonicalizes configured user-friendly address', () => {
  assert.match(canonicalAddress(MAINNET), /^0:[0-9a-f]{64}$/);
  assert.equal(canonicalAddress(RAW_MAINNET), RAW_MAINNET);
});

test('requires a strict transaction hash', () => {
  assert.equal(assertTransactionHash(TX_HASH), TX_HASH);
  assert.throws(() => assertTransactionHash('short'), /64-character hexadecimal/);
  assert.throws(() => assertTransactionHash('z'.repeat(64)), /64-character hexadecimal/);
});

test('verifies finalized destination and exact amount from blockchain evidence', async () => {
  const fetchImpl = async url => {
    if (url.includes('/transactions?')) return response({ transactions: [transaction()] });
    return response({ traces: [{ mc_seqno_end: 123, is_incomplete: false }] });
  };
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.finality, 'FINALIZED');
  assert.equal(result.amountNano, '100000000');
});

test('holds when the provider fails', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl,
  });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'PROVIDER_FAILURE');
});

test('holds an unfinalized transaction', async () => {
  const fetchImpl = async url => {
    if (url.includes('/transactions?')) return response({ transactions: [transaction()] });
    return response({ traces: [{ mc_seqno_end: 0, is_incomplete: true }] });
  };
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl,
  });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NOT_FINALIZED');
});

test('rejects wrong destination and wrong amount', async () => {
  const wrong = { ...transaction(), account: '0:' + 'b'.repeat(64), in_msg: { ...transaction().in_msg, destination: '0:' + 'b'.repeat(64), value: '200000000' } };
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [wrong] })
    : response({ traces: [{ mc_seqno_end: 123, is_incomplete: false }] });
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl,
  });
  assert.equal(result.status, 'REJECT');
  assert.match(result.reason, /destination mismatch|amount mismatch/);
});

test('rejects bounced or aborted transactions', async () => {
  for (const tx of [transaction({ bounced: true }), transaction({ aborted: true })]) {
    const fetchImpl = async url => url.includes('/transactions?')
      ? response({ transactions: [tx] })
      : response({ traces: [{ mc_seqno_end: 123, is_incomplete: false }] });
    const result = await verifyTonDeposit({
      network: 'mainnet',
      txHash: TX_HASH,
      expectedAmountTon: '0.1',
      expectedDestination: MAINNET,
      fetchImpl,
    });
    assert.equal(result.status, 'REJECT');
  }
});
