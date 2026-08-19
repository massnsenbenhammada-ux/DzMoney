'use strict';

// Read-only TON treasury forensic diagnostic.
// IMPORTANT: this tool NEVER signs, deploys, or broadcasts a transaction.
// It performs deterministic address derivation locally and makes only ONE
// read-only RPC call for the configured treasury state. This prevents the
// previous brute-force implementation from hammering Toncenter and appearing
// to hang while rate-limited.

const ton = require('@ton/ton');
const { mnemonicToHDSeed, deriveEd25519Path, keyPairFromSeed, sha256_sync } = require('@ton/crypto');

const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const targetRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const rpc = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');

// Default: scan the first 21 BIP44 account indexes. Set a single index with
// TON_FORENSIC_ACCOUNT_INDEX to make a focused investigation much faster.
const accountIndexRaw = process.env.TON_FORENSIC_ACCOUNT_INDEX;
const accountIndexes = accountIndexRaw === undefined || accountIndexRaw === ''
  ? Array.from({ length: 21 }, (_, i) => i)
  : [Math.max(0, Math.min(1000, Number(accountIndexRaw)))];

// W5R1 uses a 15-bit subwallet counter. The full scan is local and therefore
// does NOT create 32k/64k RPC requests. Override only if needed.
const w5MaxSubwallet = Math.max(0, Math.min(0x7fff, Number(process.env.TON_FORENSIC_W5_MAX_SUBWALLET || 0x7fff)));
const progressEvery = Math.max(256, Number(process.env.TON_FORENSIC_PROGRESS_EVERY || 4096));

function hasCreate(C) { return !!C && typeof C.create === 'function'; }
function normalize(value) { return ton.Address.parse(String(value)).toString({ bounceable: true, urlSafe: true }); }
function emit(stage, data) { console.log(`TON FORENSIC ${stage}: ${JSON.stringify(data)}`); }
function fingerprint(publicKey) {
  const hex = Buffer.from(publicKey).toString('hex');
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function makeKeyPair(seed) {
  const kp = keyPairFromSeed(Buffer.from(seed));
  return { publicKey: Buffer.from(kp.publicKey), secretKey: Buffer.from(kp.secretKey) };
}

async function deriveAccount(hdSeed, index) {
  const derived = await deriveEd25519Path(hdSeed, [44, 607, index]);
  return makeKeyPair(derived);
}

function addCandidate(out, version, wallet, keyPair, metadata = {}) {
  if (!wallet) return;
  out.push({
    version,
    contract: metadata.contract || version,
    wallet,
    keyPair,
    ...metadata,
    address: normalize(wallet.address)
  });
}

function buildFixedWallets(keyPair, workchain) {
  const out = [];
  const legacyId = 698983191;

  // W5R1 / W5Beta. These are deterministic and require no RPC.
  if (hasCreate(ton.WalletContractV5R1)) {
    for (const networkGlobalId of [-3, -239]) {
      addCandidate(out, `v5r1:network-${networkGlobalId}:subwallet-0`, ton.WalletContractV5R1.create({
        workchain,
        publicKey: keyPair.publicKey,
        walletId: { networkGlobalId, workchain, walletVersion: 0, subwalletNumber: 0 }
      }), keyPair, { contract: 'v5r1', networkGlobalId, subwalletNumber: 0 });
    }
  }

  if (hasCreate(ton.WalletContractV5Beta)) {
    for (const networkGlobalId of [-3, -239]) {
      addCandidate(out, `v5beta:network-${networkGlobalId}:subwallet-0`, ton.WalletContractV5Beta.create({
        workchain,
        publicKey: keyPair.publicKey,
        walletId: { networkGlobalId, workchain, walletVersion: 'v5', subwalletNumber: 0 }
      }), keyPair, { contract: 'v5beta', networkGlobalId, subwalletNumber: 0 });
    }
  }

  // Legacy wallets. 698983191 is the standard TON wallet ID used by common
  // TON wallet implementations for V1-V4 compatibility.
  const legacy = [
    ['v4r2', ton.WalletContractV4R2],
    ['v3r2', ton.WalletContractV3R2],
    ['v2r2', ton.WalletContractV2R2],
    ['v1r3', ton.WalletContractV1R3]
  ];
  for (const [name, Contract] of legacy) {
    if (!hasCreate(Contract)) continue;
    addCandidate(out, name, Contract.create({ workchain, publicKey: keyPair.publicKey, walletId: legacyId }), keyPair, { contract: name, walletId: legacyId });
  }
  return out;
}

function buildW5(workchain, keyPair, networkGlobalId, subwalletNumber) {
  if (!hasCreate(ton.WalletContractV5R1)) return null;
  return ton.WalletContractV5R1.create({
    workchain,
    publicKey: keyPair.publicKey,
    walletId: { networkGlobalId, workchain, walletVersion: 0, subwalletNumber }
  });
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
  if (words.length !== 12) throw new Error(`Forensic diagnostic currently requires the 12-word Multichain mnemonic format; got ${words.length} words.`);

  emit('START', {
    network,
    rpc,
    target: targetNormalized,
    wordCount: words.length,
    accountIndexes,
    w5MaxSubwallet,
    mode: 'LOCAL_DERIVATION_ONE_RPC_READ'
  });

  // Exactly one RPC call. Everything after this point is local computation.
  const client = new ton.TonClient({ endpoint: rpc });
  const state = await getState(client, target);
  emit('ON_CHAIN', { target: targetNormalized, ...state });

  const hdSeed = await mnemonicToHDSeed(words);
  const matches = [];
  let tested = 0;
  let accountScanned = 0;

  for (const accountIndex of accountIndexes) {
    const keyPair = await deriveAccount(hdSeed, accountIndex);
    accountScanned++;
    emit('ACCOUNT', { accountIndex, publicKeyFingerprint: fingerprint(keyPair.publicKey) });

    // First test all standard configurations with subwallet 0.
    const fixed = buildFixedWallets(keyPair, target.workChain);
    for (const candidate of fixed) {
      tested++;
      if (candidate.address === targetNormalized) {
        matches.push({
          accountIndex,
          publicKeyFingerprint: fingerprint(candidate.keyPair.publicKey),
          version: candidate.version,
          contract: candidate.contract,
          networkGlobalId: candidate.networkGlobalId,
          subwalletNumber: candidate.subwalletNumber,
          walletId: candidate.walletId,
          address: candidate.address
        });
        emit('MATCH_CANDIDATE', matches[matches.length - 1]);
      }
    }

    // Only scan the W5R1 15-bit subwallet counter if no exact match has been
    // found yet. This is local CPU work and never calls the blockchain.
    if (!matches.length && hasCreate(ton.WalletContractV5R1)) {
      for (const networkGlobalId of [-3, -239]) {
        for (let subwalletNumber = 0; subwalletNumber <= w5MaxSubwallet; subwalletNumber++) {
          const wallet = buildW5(target.workChain, keyPair, networkGlobalId, subwalletNumber);
          tested++;
          if (normalize(wallet.address) === targetNormalized) {
            const match = {
              accountIndex,
              publicKeyFingerprint: fingerprint(keyPair.publicKey),
              version: `v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`,
              contract: 'v5r1',
              networkGlobalId,
              subwalletNumber,
              address: targetNormalized
            };
            matches.push(match);
            emit('MATCH_CANDIDATE', match);
            break;
          }
          if (tested % progressEvery === 0) {
            emit('PROGRESS', { accountIndex, networkGlobalId, subwalletNumber, tested, matches: matches.length, rpcCalls: 1 });
          }
        }
        if (matches.length) break;
      }
    }

    if (matches.length) break;
  }

  emit('SUMMARY', { tested, accountScanned, matches: matches.length, matches, rpcCalls: 1 });

  if (matches.length === 1) {
    emit('RESULT', {
      status: 'UNIQUE_MATCH',
      contractState: state.state,
      nextAction: state.state === 'uninitialized'
        ? 'VERIFY_DEPLOYMENT_PARAMETERS_AND_INITIALIZE_ONLY_THE_MATCHED_WALLET'
        : 'PROCEED_TO_INDEPENDENT_SIGNER_VERIFICATION'
    });
    return;
  }

  if (matches.length === 0) {
    emit('RESULT', {
      status: 'NO_MATCH',
      contractState: state.state,
      nextAction: 'DO_NOT_DEPLOY; DO_NOT_SIGN; DO_NOT_MOVE_FUNDS; ADDRESS_IS_NOT_DERIVED_BY_TESTED_LOCAL_CONFIGURATIONS',
      important: 'If this is a TonConnect/external wallet address, it cannot be signed by this mnemonic. The treasury signer must be the wallet that actually owns the mnemonic/private key.'
    });
    process.exitCode = 2;
    return;
  }

  emit('RESULT', {
    status: 'AMBIGUOUS',
    contractState: state.state,
    nextAction: 'DO_NOT_SIGN; REQUIRE_EXPLICIT_CONFIGURATION_SELECTION_AND_SECOND_INDEPENDENT_VERIFICATION'
  });
  process.exitCode = 3;
}

main().catch(error => {
  emit('FATAL', { name: error?.name || 'Error', message: String(error?.message || error) });
  process.exitCode = 1;
});
