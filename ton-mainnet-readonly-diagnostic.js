'use strict';

// DzMoney Mainnet READ-ONLY diagnostic.
// SECURITY: this script never signs, deploys, sends, or moves funds.
// It derives the W5R1 Mainnet address locally and performs one read-only RPC call.
//
// IMPORTANT: do not use micro-key-producer/slip10 here. The installed version
// in DzMoney does not expose fromMasterSeed(). We use the same @ton/crypto
// derivation path already used by ton-forensic-diagnostic.js.

const ton = require('@ton/ton');
const {
  mnemonicToPrivateKey,
  mnemonicToHDSeed,
  deriveEd25519Path,
  keyPairFromSeed
} = require('@ton/crypto');

const MAINNET_RPC = String(process.env.TON_MAINNET_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC');
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const configuredTestnet = String(process.env.TON_TREASURY_ADDRESS || '').trim();

function normalize(address) {
  return ton.Address.parse(String(address)).toString({ bounceable: true, urlSafe: true });
}

function fingerprint(publicKey) {
  const h = Buffer.from(publicKey).toString('hex');
  return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

function keyPairFromTonSeed(seed) {
  const kp = keyPairFromSeed(Buffer.from(seed));
  return {
    publicKey: Buffer.from(kp.publicKey),
    secretKey: Buffer.from(kp.secretKey)
  };
}

async function deriveMultichain(words) {
  const hdSeed = await mnemonicToHDSeed(words);
  const seed = await deriveEd25519Path(hdSeed, [44, 607, 0]);
  return keyPairFromTonSeed(seed);
}

async function deriveKeys(words) {
  const candidates = [];

  // DzMoney's 12-word treasury format is the Multichain/BIP44 path used by
  // the existing forensic diagnostic: m/44'/607'/0'.
  if (words.length === 12) {
    candidates.push({
      scheme: "multichain-bip39:m/44'/607'/0'",
      keyPair: await deriveMultichain(words)
    });
  } else if (words.length === 24) {
    try {
      candidates.push({ scheme: 'ton', keyPair: await mnemonicToPrivateKey(words) });
    } catch (_) {}
    try {
      candidates.push({
        scheme: "multichain-bip39:m/44'/607'/0'",
        keyPair: await deriveMultichain(words)
      });
    } catch (_) {}
  } else {
    throw new Error(`Mnemonic must contain 12 or 24 words; got ${words.length}.`);
  }

  if (!candidates.length) throw new Error('No supported mnemonic derivation succeeded.');
  return candidates;
}

async function main() {
  if (!mnemonicRaw) throw new Error('TON_TREASURY_MNEMONIC is missing.');
  if (!ton.WalletContractV5R1 || typeof ton.WalletContractV5R1.create !== 'function') {
    throw new Error('WalletContractV5R1 is unavailable in installed @ton/ton.');
  }

  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  const keys = await deriveKeys(words);
  const matches = [];

  console.log('MAINNET READ-ONLY DIAGNOSTIC: START');
  console.log(JSON.stringify({
    network: 'mainnet',
    networkGlobalId: -239,
    wallet: 'W5R1',
    workchain: 0,
    walletVersion: 0,
    subwalletNumber: 0,
    configuredTestnetAddress: configuredTestnet ? normalize(configuredTestnet) : 'MISSING',
    rpc: MAINNET_RPC,
    signing: false,
    deployment: false,
    broadcast: false
  }));

  for (const candidate of keys) {
    const wallet = ton.WalletContractV5R1.create({
      workchain: 0,
      publicKey: candidate.keyPair.publicKey,
      walletId: {
        networkGlobalId: -239,
        workchain: 0,
        walletVersion: 0,
        subwalletNumber: 0
      }
    });

    const address = normalize(wallet.address);
    const row = {
      scheme: candidate.scheme,
      publicKeyFingerprint: fingerprint(candidate.keyPair.publicKey),
      mainnetAddress: address,
      expectedNetworkGlobalId: -239,
      contract: 'W5R1'
    };
    console.log('DERIVED', JSON.stringify(row));
    matches.push({ ...row, address });
  }

  const client = new ton.TonClient({ endpoint: MAINNET_RPC });
  const unique = [...new Map(matches.map(m => [m.address, m])).values()];
  for (const match of unique) {
    const state = await client.getContractState(match.address);
    console.log('ON_CHAIN', JSON.stringify({
      address: match.address,
      state: state.state,
      balanceNano: state.balance?.toString?.() || '0',
      readOnlyRpcCall: true
    }));
  }

  console.log('RESULT', JSON.stringify({
    status: unique.length === 1 ? 'MAINNET_ADDRESS_VERIFIED_READ_ONLY' : 'MULTIPLE_DERIVATIONS_REQUIRE_REVIEW',
    address: unique.length === 1 ? unique[0].address : null,
    nextAction: 'DO_NOT_DEPLOY_OR_SIGN_OR_MOVE_FUNDS_FROM_THIS_DIAGNOSTIC'
  }));
}

main().catch(error => {
  console.error('MAINNET READ-ONLY DIAGNOSTIC: FATAL', JSON.stringify({
    name: error?.name || 'Error',
    message: String(error?.message || error)
  }));
  process.exitCode = 1;
});
