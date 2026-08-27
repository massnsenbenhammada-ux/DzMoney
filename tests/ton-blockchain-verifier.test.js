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
const RAW_MAINNET = '0:1a44daa7d35be34f30dd49a37c2edb16a594569214506645c23737dbdf3d190d';
const TX_HASH = 'a'.repeat(64);
const OTHER_TX_HASH = 'b'.repeat(64);
const TX_HASH_BASE64 = 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=';

function response(payload, ok = true, status = 200) {
  return { ok, status, async json() { return payload; } };
}
function trace(hash = TX_HASH, overrides = {}) {
  return { tx_hash: hash, mc_seqno_end: 123, is_incomplete: false, ...overrides };
}
function transaction({ value = '100000000', destination = RAW_MAINNET, account = RAW_MAINNET, bounced = false, aborted = false, hash = TX_HASH } = {}) {
  return { hash, account, mc_block_seqno: 123, description: { aborted }, in_msg: { destination, value, bounced } };
}
function masterchain(seqno = 130) {
  return { last: { seqno } };
}
function finalizedFetch({ currentSeqno = 130, traceOverrides = {}, tx = transaction() } = {}) {
  return async url => {
    if (url.includes('/transactions?')) return response({ transactions: [tx] });
    if (url.includes('/traces?')) return response({ traces: [trace(TX_HASH, traceOverrides)] });
    return response(masterchain(currentSeqno));
  };
}

test('converts TON decimal exactly to nanoTON', () => {
  assert.equal(tonToNano('0.1'), 100000000n);
  assert.equal(tonToNano('1'), 1000000000n);
  assert.equal(tonToNano('0.000000001'), 1n);
  assert.throws(() => tonToNano('0.0000000001'), /nanoTON precision/);
});

test('canonicalizes configured user-friendly address', () => {
  assert.equal(canonicalAddress(MAINNET), RAW_MAINNET);
  assert.equal(canonicalAddress(RAW_MAINNET), RAW_MAINNET);
});

test('requires a strict transaction hash', () => {
  assert.equal(assertTransactionHash(TX_HASH), TX_HASH);
  assert.throws(() => assertTransactionHash('short'), /64-character hexadecimal/);
  assert.throws(() => assertTransactionHash('z'.repeat(64)), /64-character hexadecimal/);
});

test('verifies finalized destination and exact amount from blockchain evidence', async () => {
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl: finalizedFetch() });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.finality, 'FINALIZED');
  assert.equal(result.amountNano, '100000000');
});

test('matches a provider transaction hash returned as base64', async () => {
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [transaction({ hash: TX_HASH_BASE64 })] })
    : url.includes('/traces?')
      ? response({ traces: [trace(TX_HASH_BASE64)] })
      : response(masterchain());
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: 'aa'.repeat(32), expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'VERIFIED');
});

test('holds when the provider fails', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'PROVIDER_FAILURE');
});

test('holds when masterchain freshness cannot be established', async () => {
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [transaction()] })
    : url.includes('/traces?')
      ? response({ traces: [trace()] })
      : (() => { throw new Error('masterchain unavailable'); })();
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'MASTERCHAIN_INFO_UNAVAILABLE');
});

test('holds when observed masterchain is behind the evidence block', async () => {
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl: finalizedFetch({ currentSeqno: 122 }),
  });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'MASTERCHAIN_BEHIND_EVIDENCE');
});

test('accepts finalized evidence when the current masterchain is at or beyond the evidence seqno', async () => {
  const result = await verifyTonDeposit({
    network: 'mainnet',
    txHash: TX_HASH,
    expectedAmountTon: '0.1',
    expectedDestination: MAINNET,
    fetchImpl: finalizedFetch({ currentSeqno: 123 }),
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.masterchainSeqno, 123);
  assert.equal(result.observedMasterchainSeqno, 123);
});

test('holds an unfinalized transaction even when transaction has mc_block_seqno', async () => {
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [transaction()] })
    : url.includes('/traces?')
      ? response({ traces: [trace(TX_HASH, { mc_seqno_end: 123, is_incomplete: true })] })
      : response(masterchain());
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NOT_FINALIZED');
});

test('holds when finality trace is incomplete', async () => {
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [transaction()] })
    : url.includes('/traces?')
      ? response({ traces: [trace(TX_HASH, { mc_seqno_end: 0, is_incomplete: true })] })
      : response(masterchain());
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NOT_FINALIZED');
});

test('holds when trace does not bind to the requested transaction', async () => {
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [transaction()] })
    : url.includes('/traces?')
      ? response({ traces: [trace(OTHER_TX_HASH)] })
      : response(masterchain());
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'TRACE_TRANSACTION_MISMATCH');
});

test('rejects wrong destination and wrong amount', async () => {
  const wrong = { ...transaction(), account: '0:' + 'b'.repeat(64), in_msg: { ...transaction().in_msg, destination: '0:' + 'b'.repeat(64), value: '200000000' } };
  const fetchImpl = async url => url.includes('/transactions?')
    ? response({ transactions: [wrong] })
    : url.includes('/traces?')
      ? response({ traces: [trace()] })
      : response(masterchain());
  const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
  assert.equal(result.status, 'REJECT');
  assert.match(result.reason, /destination mismatch|amount mismatch/);
});

test('rejects bounced or aborted transactions', async () => {
  for (const tx of [transaction({ bounced: true }), transaction({ aborted: true })]) {
    const fetchImpl = async url => url.includes('/transactions?')
      ? response({ transactions: [tx] })
      : url.includes('/traces?')
        ? response({ traces: [trace()] })
        : response(masterchain());
    const result = await verifyTonDeposit({ network: 'mainnet', txHash: TX_HASH, expectedAmountTon: '0.1', expectedDestination: MAINNET, fetchImpl });
    assert.equal(result.status, 'REJECT');
  }
});
