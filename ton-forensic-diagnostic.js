'use strict';

// Read-only TON treasury forensic diagnostic.
// It NEVER signs, deploys, or broadcasts a transaction.
// It follows the TON wallet interoperability guideline for 12-word Multichain
// mnemonics and checks deterministic account indexes plus supported wallet
// contracts before concluding that a mnemonic/address pair is unrelated.

const ton = require('@ton/ton');
const { mnemonicToHDSeed, deriveEd25519Path, keyPairFromSeed, sha256_sync } = require('@ton/crypto');
const { Pool } = require('pg');

const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const targetRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const rpc = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');
const maxAccountIndex = Math.max(0, Math.min(100, Number(process.env.TON_DIAGNOSTIC_MAX_ACCOUNT_INDEX || 20)));

function hasCreate(C) { return !!C && typeof C.create === 'function'; }
function normalize(value) { return ton.Address.parse(String(value)).toString({ bounceable: true, urlSafe: true }); }
function emit(stage, data) { console.log(`TON FORENSIC ${stage}: ${JSON.stringify(data)}`); }

function makeKeyPair(seed) {
  const kp = keyPairFromSeed(Buffer.from(seed));
  return { publicKey: Buffer.from(kp.publicKey), secretKey: Buffer.from(kp.secretKey) };
}

async function deriveAccount(words, index) {
  const hdSeed = await mnemonicToHDSeed(words);
  const derived = await deriveEd25519Path(hdSeed, [44, 607, index]);
  return makeKeyPair(derived);
}

function buildWallets(keyPair, workchain) {
  const out = [];
  const add = (version, wallet, metadata = {}) => wallet && out.push({ version, wallet, keyPair, ...metadata });

  // V5R1: TON's official client-context wallet-id is constructed from
  // network_global_id, workchain, wallet_version=0 and a 15-bit counter.
  if (hasCreate(ton.WalletContractV5R1)) {
    for (const networkGlobalId of [-3, -239]) {
      for (const subwalletNumber of [0]) {
        add(`v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`, ton.WalletContractV5R1.create({
          workchain,
          publicKey: keyPair.publicKey,
          walletId: { networkGlobalId, workchain, walletVersion: 0, subwalletNumber }
        }), { contract: 'v5r1', networkGlobalId, subwalletNumber });
      }
    }
  }

  if (hasCreate(ton.WalletContractV5Beta)) {
    for (const networkGlobalId of [-3, -239]) {
      add(`v5beta:network-${networkGlobalId}:subwallet-0`, ton.WalletContractV5Beta.create({
        workchain,
        publicKey: keyPair.publicKey,
        walletId: { networkGlobalId, workchain, walletVersion: 'v5', subwalletNumber: 0 }
      }), { contract: 'v5beta', networkGlobalId, subwalletNumber: 0 });
    }
  }

  const legacyId = 698983191;
  if (hasCreate(ton.WalletContractV4R2)) add('v4r2', ton.WalletContractV4R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyId }), { contract: 'v4r2', walletId: legacyId });
  if (hasCreate(ton.WalletContractV3R2)) add('v3r2', ton.WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyId }), { contract: 'v3r2', walletId: legacyId });
  if (hasCreate(ton.WalletContractV2R2)) add('v2r2', ton.WalletContractV2R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyId }), { contract: 'v2r2', walletId: legacyId });
  if (hasCreate(ton.WalletContractV1R3)) add('v1r3', ton.WalletContractV1R3.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyId }), { contract: 'v1r3', walletId: legacyId });
  return out;
}

async function getState(client, address) {
  const state = await client.getContractState(address);
  return {
    state: state.state,
    balanceNano: state.balance?.toString?.() || '0',
    codeHash: state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null,
    dataHash: state.data ? sha256_sync(state.data.toBoc()).toString('hex') : null
  };
}

async function main() {
  if (network !== 'testnet') throw new Error('Forensic diagnostic is restricted to testnet.');
  if (!targetRaw || !mnemonicRaw) throw new Error('TON_TREASURY_ADDRESS and TON_TREASURY_MNEMONIC are required.');

  const target = ton.Address.parse(targetRaw);
  const targetNormalized = normalize(target);
  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12) throw new Error(`This forensic pass intentionally targets the 12-word Multichain case; got ${words.length} words.`);

  emit('START', { network, rpc, target: targetNormalized, wordCount: words.length, maxAccountIndex });
  const client = new ton.TonClient({ endpoint: rpc });
  const state = await getState(client, target);
  emit('ON_CHAIN', { target: targetNormalized, ...state });

  const matches = [];
  let tested = 0;
  const seen = new Set();

  for (let accountIndex = 0; accountIndex <= maxAccountIndex; accountIndex++) {
    const keyPair = await deriveAccount(words, accountIndex);
    const publicKeyHex = keyPair.publicKey.toString('hex');
    const wallets = buildWallets(keyPair, target.workChain);
    for (const candidate of wallets) {
      const address = normalize(candidate.wallet.address);
      tested++;
      const key = `${accountIndex}|${candidate.version}|${address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (address === targetNormalized) {
        matches.push({ accountIndex, publicKeyFingerprint: `${publicKeyHex.slice(0, 8)}…${publicKeyHex.slice(-8)}`, version: candidate.version, contract: candidate.contract, networkGlobalId: candidate.networkGlobalId, subwalletNumber: candidate.subwalletNumber, walletId: candidate.walletId, address });
        emit('MATCH_CANDIDATE', matches[matches.length - 1]);
      }
    }
  }

  // Only after the deterministic account-index scan, search W5R1's actual
  // 15-bit client subwallet counter. This is bounded by the contract format,
  // not an arbitrary large brute-force search.
  if (!matches.length && hasCreate(ton.WalletContractV5R1)) {
    for (let accountIndex = 0; accountIndex <= maxAccountIndex; accountIndex++) {
      const keyPair = await deriveAccount(words, accountIndex);
      for (const networkGlobalId of [-3, -239]) {
        for (let subwalletNumber = 0; subwalletNumber <= 0x7fff; subwalletNumber++) {
          const wallet = ton.WalletContractV5R1.create({
            workchain: target.workChain,
            publicKey: keyPair.publicKey,
            walletId: { networkGlobalId, workchain: target.workChain, walletVersion: 0, subwalletNumber }
          });
          tested++;
          if (normalize(wallet.address) === targetNormalized) {
            matches.push({ accountIndex, version: `v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`, contract: 'v5r1', networkGlobalId, subwalletNumber, address: targetNormalized });
            emit('MATCH_CANDIDATE', matches[matches.length - 1]);
            break;
          }
        }
        if (matches.length) break;
      }
      if (matches.length) break;
    }
  }

  emit('SUMMARY', { tested, matches: matches.length, matches });

  if (matches.length === 1) {
    emit('RESULT', { status: 'UNIQUE_MATCH', contractState: state.state, nextAction: state.state === 'uninitialized' ? 'VERIFY_STATE_INIT_AND_DEPLOY_MATCHED_WALLET_ONLY' : 'PROCEED_TO_SIGNER_VERIFICATION' });
    return;
  }
  if (matches.length === 0) {
    emit('RESULT', { status: 'NO_MATCH', contractState: state.state, nextAction: 'DO_NOT_DEPLOY; DO_NOT_SIGN; DO_NOT_MOVE_FUNDS; MNEMONIC_DOES_NOT_DERIVE_TARGET_UNDER_TESTED_STANDARD_CONFIGURATIONS' });
    process.exitCode = 2;
    return;
  }
  emit('RESULT', { status: 'AMBIGUOUS', contractState: state.state, nextAction: 'DO_NOT_SIGN; REQUIRE_EXPLICIT_CONFIGURATION_SELECTION_AND_SECOND_INDEPENDENT_VERIFICATION' });
  process.exitCode = 3;
}

main().catch(error => {
  emit('FATAL', { name: error?.name || 'Error', message: String(error?.message || error) });
  process.exitCode = 1;
});
