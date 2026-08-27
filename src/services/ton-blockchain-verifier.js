'use strict';

const { decodeTonAddress } = require('./admin-settings-service');

const NETWORK_BASE_URLS = Object.freeze({
  mainnet: 'https://toncenter.com/api/v3',
  testnet: 'https://testnet.toncenter.com/api/v3',
});

function assertNetwork(network) {
  if (!Object.prototype.hasOwnProperty.call(NETWORK_BASE_URLS, network)) throw new Error('Unsupported TON network');
}

function toRawAddress(address) {
  const decoded = decodeTonAddress(address);
  const encoded = address.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(encoded, 'base64');
  return `${decoded.workchain}:${bytes.subarray(2, 34).toString('hex')}`;
}

function canonicalAddress(address) {
  if (typeof address !== 'string') throw new Error('TON address must be a string');
  const value = address.trim();
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(value)) {
    const [workchain, hash] = value.split(':');
    return `${Number(workchain)}:${hash.toLowerCase()}`;
  }
  return toRawAddress(value);
}

function tonToNano(value) {
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('TON amount must be a positive decimal');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > 9) throw new Error('TON amount exceeds nanoTON precision');
  const nano = BigInt(whole || '0') * 1000000000n + BigInt((fraction + '000000000').slice(0, 9) || '0');
  if (nano <= 0n) throw new Error('TON amount must be positive');
  return nano;
}

function assertTransactionHash(txHash) {
  if (typeof txHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txHash.trim())) throw new Error('TON transaction hash must be a 64-character hexadecimal hash');
  return txHash.trim().toLowerCase();
}

function hashToHex(value) {
  const text = String(value || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) return text.toLowerCase();
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length === 32) return bytes.toString('hex');
  } catch {}
  return null;
}

function hashesEqual(left, right) {
  const leftHex = hashToHex(left);
  const rightHex = hashToHex(right);
  return Boolean(leftHex && rightHex && leftHex === rightHex);
}

async function fetchJson(url, apiKey, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const response = await fetchImpl(url, { headers: apiKey ? { 'X-API-Key': apiKey } : {} });
  if (!response.ok) throw new Error(`TON provider HTTP ${response.status}`);
  return response.json();
}

function findTransaction(payload, txHash) {
  const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
  return transactions.find(tx => hashesEqual(tx?.hash, txHash) || hashesEqual(tx?.hash_norm, txHash)) || null;
}

function findTraceTransaction(trace, txHash) {
  const transactions = trace?.transactions;
  if (!transactions || typeof transactions !== 'object') return null;
  return Object.values(transactions).find(tx => hashesEqual(tx?.hash, txHash) || hashesEqual(tx?.hash_norm, txHash)) || null;
}

function isFinalized(trace) {
  return Boolean(trace && trace.is_incomplete === false && Number.isInteger(Number(trace.mc_seqno_end)) && Number(trace.mc_seqno_end) > 0);
}

function assertIncomingTransfer(transaction, expectedDestination, expectedNano) {
  if (!transaction?.in_msg) throw new Error('TON transaction has no inbound message');
  if (transaction.description?.aborted) throw new Error('TON transaction was aborted');
  if (transaction.in_msg.bounced) throw new Error('TON inbound message was bounced');
  const destination = canonicalAddress(transaction.in_msg.destination);
  const account = canonicalAddress(transaction.account);
  const expected = canonicalAddress(expectedDestination);
  if (destination !== expected || account !== expected) throw new Error('TON transaction destination mismatch');
  const actualNano = BigInt(String(transaction.in_msg.value || '0'));
  if (actualNano !== expectedNano) throw new Error('TON transaction amount mismatch');
}

async function verifyTonDeposit({ network, txHash, expectedAmountTon, expectedDestination, apiKey = '', fetchImpl, baseUrl }) {
  assertNetwork(network);
  const hash = assertTransactionHash(txHash);
  const expectedNano = tonToNano(expectedAmountTon);
  const destination = canonicalAddress(expectedDestination);
  const root = (baseUrl || NETWORK_BASE_URLS[network]).replace(/\/$/, '');
  let transactionPayload;
  let tracePayload;
  try {
    transactionPayload = await fetchJson(`${root}/transactions?hash=${encodeURIComponent(hash)}&limit=10`, apiKey, fetchImpl);
    tracePayload = await fetchJson(`${root}/traces?tx_hash=${encodeURIComponent(hash)}&limit=1`, apiKey, fetchImpl);
  } catch (error) {
    return { status: 'HOLD', reason: 'PROVIDER_FAILURE', providerError: error.message };
  }
  const trace = tracePayload?.traces?.[0] || null;
  const transaction = findTransaction(transactionPayload, hash) || findTraceTransaction(trace, hash);
  if (!transaction) return { status: 'HOLD', reason: 'TRANSACTION_NOT_FOUND' };
  if (!isFinalized(trace)) return { status: 'HOLD', reason: 'NOT_FINALIZED', transaction };
  try {
    assertIncomingTransfer(transaction, destination, expectedNano);
  } catch (error) {
    return { status: 'REJECT', reason: error.message, transaction };
  }
  return { status: 'VERIFIED', network, transactionHash: hash, destination, amountNano: expectedNano.toString(), finality: 'FINALIZED', masterchainSeqno: Number(trace.mc_seqno_end), transaction };
}

module.exports = { NETWORK_BASE_URLS, canonicalAddress, tonToNano, assertTransactionHash, verifyTonDeposit };
