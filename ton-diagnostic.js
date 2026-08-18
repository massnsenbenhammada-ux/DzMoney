'use strict';

const ton = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { mnemonicToSeedSync } = require('@scure/bip39');
const slip10 = require('micro-key-producer/slip10.js');
const { sha256_sync } = require('@ton/crypto');

const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const configuredRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const rpc = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');

function hasCreate(C) { return !!C && typeof C.create === 'function'; }
function normalize(value) { return ton.Address.parse(String(value)).toString({ bounceable: true, urlSafe: true }); }
function short(value) { const s = String(value || ''); return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s; }
function emit(stage, data) { console.log(`TON DIAGNOSTIC ${stage}: ${JSON.stringify(data)}`); }

function makeKeyPair(publicKey, privateKey) {
  const pub = Buffer.from(publicKey);
  const priv = Buffer.from(privateKey);
  return { publicKey: pub, secretKey: Buffer.concat([priv, pub]) };
}

function deriveMultichain(words) {
  const seed = mnemonicToSeedSync(words.join(' '), '');
  const root = slip10.fromMasterSeed(seed);
  const account = root.derive("m/44'/607'/0'");
  return makeKeyPair(account.publicKeyRaw, account.privateKey);
}

async function deriveKeyCandidates(words) {
  const result = [];
  const seen = new Set();
  const add = (scheme, keyPair) => {
    if (!keyPair?.publicKey || !keyPair?.secretKey) return;
    const fingerprint = Buffer.from(keyPair.publicKey).toString('hex');
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    result.push({ scheme, keyPair, publicKeyHex: fingerprint });
  };

  // 12-word mnemonics are Multichain/BIP39 by the TON wallet guideline.
  if (words.length === 12) {
    add('multichain-bip39:m/44\'/607\'/0\'', deriveMultichain(words));
  } else {
    // 24-word phrases can be TON-specific, Multichain, or valid under both.
    try { add('ton', await mnemonicToPrivateKey(words)); } catch (_) {}
    try { add('multichain-bip39:m/44\'/607\'/0\'', deriveMultichain(words)); } catch (_) {}
  }
  return result;
}

function walletCandidates(keyPair, workchain) {
  const out = [];
  const add = (version, wallet, metadata = {}) => {
    if (!wallet) return;
    out.push({ version, wallet, ...metadata });
  };

  // Standard W5R1 testnet and the documented wallet.ton.org testnet quirk.
  if (hasCreate(ton.WalletContractV5R1)) {
    add('v5r1:testnet-network-id--3:subwallet-0', ton.WalletContractV5R1.create({
      workchain,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -3, workchain, walletVersion: 0, subwalletNumber: 0 }
    }), { contract: 'v5r1', networkGlobalId: -3, subwalletNumber: 0 });
    add('v5r1:wallet-ton-org-mainnet-id--239-on-testnet:subwallet-0', ton.WalletContractV5R1.create({
      workchain,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -239, workchain, walletVersion: 0, subwalletNumber: 0 }
    }), { contract: 'v5r1', networkGlobalId: -239, subwalletNumber: 0, walletTonOrgLegacy: true });
  }

  // V5Beta is kept for historical wallet discovery only; it is never preferred
  // over a unique active contract identity.
  if (hasCreate(ton.WalletContractV5Beta)) {
    add('v5beta:testnet-network-id--3:subwallet-0', ton.WalletContractV5Beta.create({
      workchain,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -3, workchain, walletVersion: 'v5', subwalletNumber: 0 }
    }), { contract: 'v5beta', networkGlobalId: -3, subwalletNumber: 0 });
    add('v5beta:wallet-ton-org-mainnet-id--239-on-testnet:subwallet-0', ton.WalletContractV5Beta.create({
      workchain,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -239, workchain, walletVersion: 'v5', subwalletNumber: 0 }
    }), { contract: 'v5beta', networkGlobalId: -239, subwalletNumber: 0, walletTonOrgLegacy: true });
  }

  const legacyWalletId = 698983191;
  if (hasCreate(ton.WalletContractV4R2)) add('v4r2:subwallet-698983191', ton.WalletContractV4R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyWalletId }), { contract: 'v4r2', subwalletNumber: legacyWalletId });
  if (hasCreate(ton.WalletContractV3R2)) add('v3r2:subwallet-698983191', ton.WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyWalletId }), { contract: 'v3r2', subwalletNumber: legacyWalletId });
  if (hasCreate(ton.WalletContractV2R2)) add('v2r2:subwallet-698983191', ton.WalletContractV2R2.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyWalletId }), { contract: 'v2r2', subwalletNumber: legacyWalletId });
  if (hasCreate(ton.WalletContractV1R3)) add('v1r3:subwallet-698983191', ton.WalletContractV1R3.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyWalletId }), { contract: 'v1r3', subwalletNumber: legacyWalletId });
  return out;
}

async function inspect(client, address) {
  const state = await client.getContractState(address);
  return {
    state: state.state,
    balanceNano: state.balance?.toString?.() || '0',
    codeHash: state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null,
    dataHash: state.data ? sha256_sync(state.data.toBoc()).toString('hex') : null,
    codeBits: state.code?.bits?.length ?? null,
    dataBits: state.data?.bits?.length ?? null
  };
}

async function main() {
  emit('START', { network, rpc, configuredAddress: configuredRaw ? short(configuredRaw) : 'MISSING', mnemonic: mnemonicRaw ? 'PRESENT' : 'MISSING' });
  if (network !== 'testnet') throw new Error('Diagnostic is intentionally restricted to TON Testnet.');
  if (!configuredRaw || !mnemonicRaw) throw new Error('TON_TREASURY_ADDRESS and TON_TREASURY_MNEMONIC are required.');

  const treasury = ton.Address.parse(configuredRaw);
  const treasuryNormalized = normalize(treasury);
  emit('TREASURY', { address: treasuryNormalized, workchain: treasury.workChain });

  const client = new ton.TonClient({ endpoint: rpc });
  const chain = await inspect(client, treasury);
  emit('ON_CHAIN', chain);

  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) throw new Error(`Mnemonic must contain 12 or 24 words; got ${words.length}.`);

  const keyCandidates = await deriveKeyCandidates(words);
  emit('KEYS', keyCandidates.map(k => ({ scheme: k.scheme, wordCount: words.length, publicKeyFingerprint: short(k.publicKeyHex), publicKeyHex: k.publicKeyHex })));

  const matches = [];
  const candidateRows = [];
  const seenAddresses = new Set();
  for (const keyCandidate of keyCandidates) {
    for (const candidate of walletCandidates(keyCandidate.keyPair, treasury.workChain)) {
      const address = normalize(candidate.wallet.address);
      if (seenAddresses.has(`${keyCandidate.scheme}|${address}`)) continue;
      seenAddresses.add(`${keyCandidate.scheme}|${address}`);
      const row = {
        scheme: keyCandidate.scheme,
        version: candidate.version,
        address,
        match: address === treasuryNormalized,
        ...(candidate.networkGlobalId !== undefined ? { networkGlobalId: candidate.networkGlobalId } : {}),
        ...(candidate.subwalletNumber !== undefined ? { subwalletNumber: candidate.subwalletNumber } : {}),
        ...(candidate.walletTonOrgLegacy ? { walletTonOrgLegacy: true } : {})
      };
      candidateRows.push(row);
      if (row.match) matches.push({ ...candidate, scheme: keyCandidate.scheme, keyPair: keyCandidate.keyPair, address });
    }
  }

  // If the exact standard configurations did not match, scan only W5R1 client
  // subwallets. This is deterministic discovery, not blind signing: the final
  // result still requires exactly one mnemonic/address match.
  let scannedV5Subwallets = 0;
  if (!matches.length && hasCreate(ton.WalletContractV5R1)) {
    for (const keyCandidate of keyCandidates) {
      for (const networkGlobalId of [-3, -239]) {
        for (let subwalletNumber = 0; subwalletNumber <= 0x7fff; subwalletNumber++) {
          scannedV5Subwallets += 1;
          const wallet = ton.WalletContractV5R1.create({
            workchain: treasury.workChain,
            publicKey: keyCandidate.keyPair.publicKey,
            walletId: { networkGlobalId, workchain: treasury.workChain, walletVersion: 0, subwalletNumber }
          });
          const address = normalize(wallet.address);
          if (address === treasuryNormalized) {
            matches.push({ scheme: keyCandidate.scheme, version: `v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`, wallet, keyPair: keyCandidate.keyPair, address, networkGlobalId, subwalletNumber });
            break;
          }
        }
        if (matches.some(m => m.scheme === keyCandidate.scheme && m.networkGlobalId === networkGlobalId)) break;
      }
      if (matches.length) break;
    }
  }

  emit('CANDIDATES', {
    exactCandidates: candidateRows.length,
    scannedV5Subwallets,
    matches: candidateRows.filter(c => c.match).length + (matches.length - candidateRows.filter(c => c.match).length),
    sample: candidateRows.slice(0, 12)
  });
  emit('MATCH', { count: matches.length, matches: matches.map(m => ({ scheme: m.scheme, version: m.version, address: m.address, networkGlobalId: m.networkGlobalId, subwalletNumber: m.subwalletNumber })) });

  if (matches.length === 1) {
    emit('RESULT', {
      status: 'UNIQUE_MATCH',
      signer: matches[0].version,
      mnemonicScheme: matches[0].scheme,
      address: matches[0].address,
      networkGlobalId: matches[0].networkGlobalId,
      subwalletNumber: matches[0].subwalletNumber,
      walletTonOrgLegacy: !!matches[0].walletTonOrgLegacy,
      contractState: chain.state,
      nextAction: chain.state === 'uninitialized' ? 'DEPLOY_REQUIRED_BEFORE_PAYOUT' : 'READY_FOR_SIGNER_VERIFICATION'
    });
    return;
  }
  if (matches.length === 0) {
    emit('RESULT', { status: 'NO_MATCH', contractState: chain.state, nextAction: 'DO_NOT_DEPLOY_OR_SEND; MNEMONIC_SCHEME_OR_WALLET_CONFIGURATION_DOES_NOT_MATCH' });
    process.exitCode = 2;
    return;
  }
  emit('RESULT', { status: 'AMBIGUOUS', count: matches.length, contractState: chain.state, nextAction: 'DO_NOT_SEND; MULTIPLE_VALID_CONFIGURATIONS_MATCH' });
  process.exitCode = 3;
}

main().catch(error => {
  emit('FATAL', { name: error?.name || 'Error', message: String(error?.message || error) });
  process.exitCode = 1;
});
