'use strict';

// Read-only compatibility diagnostic that reproduces the wallet.ton.org
// derivation path used by the official wallet source.
// IMPORTANT: this file NEVER signs, deploys, or broadcasts a transaction.
// It performs one read-only RPC request and all address derivation locally.

const ton = require('@ton/ton');
const { mnemonicToSeedSync } = require('@ton/crypto');
const { mnemonicToSeedSync: scureMnemonicToSeedSync } = require('@scure/bip39');
const slip10Module = require('micro-key-producer/slip10.js');
const slip10 = slip10Module.default || slip10Module;
const { sha256_sync } = require('@ton/crypto');

const NETWORK = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const RPC = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');
const TARGET_RAW = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const MNEMONIC_RAW = String(process.env.TON_TREASURY_MNEMONIC || '').trim();

const TON_BIP39_PATH = "m/44'/607'/0'";
const WALLET_ORG_NETWORK_GLOBAL_ID = -239;
const STANDARD_TESTNET_NETWORK_GLOBAL_ID = -3;

function emit(stage, data) {
  console.log(`TON WALLET.ORG ${stage}: ${JSON.stringify(data)}`);
}

function normalize(address, options = {}) {
  return ton.Address.parse(String(address)).toString({
    urlSafe: true,
    bounceable: options.bounceable ?? true,
    testOnly: options.testOnly ?? false,
  });
}

function fingerprint(publicKey) {
  const hex = Buffer.from(publicKey).toString('hex');
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function deriveWalletOrgBip39Key(words) {
  if (!slip10 || typeof slip10.fromMasterSeed !== 'function') {
    throw new Error('micro-key-producer SLIP10 API unavailable: expected fromMasterSeed()');
  }

  // wallet.ton.org uses the BIP39 seed and TON HD path m/44'/607'/0'.
  // micro-key-producer is ESM-first in recent releases, so CommonJS may
  // expose the HDKey implementation through .default.
  const seed = scureMnemonicToSeedSync(words.join(' '), '');
  const root = slip10.fromMasterSeed(seed);
  const account = root.derive(TON_BIP39_PATH);
  const publicKey = Buffer.from(account.publicKeyRaw);
  const privateKey = Buffer.from(account.privateKey);
  return {
    publicKey,
    secretKey: Buffer.concat([privateKey, publicKey]),
    scheme: `wallet.ton.org:bip39:${TON_BIP39_PATH}`,
  };
}

function buildW5(publicKey, networkGlobalId) {
  if (!ton.WalletContractV5R1 || typeof ton.WalletContractV5R1.create !== 'function') {
    throw new Error('WalletContractV5R1.create is unavailable in installed @ton/ton.');
  }

  return ton.WalletContractV5R1.create({
    workchain: 0,
    publicKey,
    walletId: {
      networkGlobalId,
      workchain: 0,
      walletVersion: 0,
      subwalletNumber: 0,
    },
  });
}

async function inspect(client, address) {
  const state = await client.getContractState(address);
  return {
    state: state.state,
    balanceNano: state.balance?.toString?.() || '0',
    codeHash: state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null,
    dataHash: state.data ? sha256_sync(state.data.toBoc()).toString('hex') : null,
  };
}

async function main() {
  if (NETWORK !== 'testnet') {
    throw new Error('This diagnostic is intentionally restricted to TON Testnet.');
  }
  if (!TARGET_RAW || !MNEMONIC_RAW) {
    throw new Error('TON_TREASURY_ADDRESS and TON_TREASURY_MNEMONIC are required.');
  }

  const target = ton.Address.parse(TARGET_RAW);
  const targetRaw = target.toRawString();
  const words = MNEMONIC_RAW.split(/\s+/).filter(Boolean);

  if (words.length !== 12) {
    throw new Error(`Expected the 12-word Multichain mnemonic used by the current wallet import; got ${words.length} words.`);
  }

  emit('START', {
    network: NETWORK,
    rpc: RPC,
    targetRaw,
    targetTestnetNonBounceable: normalize(target, { bounceable: false, testOnly: true }),
    wordCount: words.length,
    mode: 'EXACT_WALLET_TON_ORG_SOURCE_REPRODUCTION',
  });

  // Exactly one blockchain read. No RPC is performed during derivation.
  const client = new ton.TonClient({ endpoint: RPC });
  const onChain = await inspect(client, target);
  emit('ON_CHAIN', onChain);

  const walletOrgKey = deriveWalletOrgBip39Key(words);
  emit('KEY', {
    scheme: walletOrgKey.scheme,
    publicKeyFingerprint: fingerprint(walletOrgKey.publicKey),
  });

  // wallet.ton.org's buildWallet() creates W5R1 without a network argument.
  // @ton/ton's W5R1 default is the Mainnet wallet ID (-239). The web wallet
  // then displays the address with testOnly=true for Testnet.
  const walletOrgW5 = buildW5(walletOrgKey.publicKey, WALLET_ORG_NETWORK_GLOBAL_ID);
  const walletOrgAddress = normalize(walletOrgW5.address, { bounceable: false, testOnly: true });

  // Normal @ton/ton Testnet W5R1 configuration for comparison.
  const standardTestnetW5 = buildW5(walletOrgKey.publicKey, STANDARD_TESTNET_NETWORK_GLOBAL_ID);
  const standardTestnetAddress = normalize(standardTestnetW5.address, { bounceable: false, testOnly: true });

  const walletOrgBounceable = normalize(walletOrgW5.address, { bounceable: true, testOnly: true });

  const matches = {
    walletTonOrgExact: walletOrgAddress === normalize(target, { bounceable: false, testOnly: true }),
    walletTonOrgRaw: walletOrgW5.address.toRawString() === targetRaw,
    standardTestnetW5: standardTestnetAddress === normalize(target, { bounceable: false, testOnly: true }),
  };

  emit('DERIVATION', {
    walletTonOrg: {
      networkGlobalId: WALLET_ORG_NETWORK_GLOBAL_ID,
      walletVersion: 'W5R1',
      subwalletNumber: 0,
      addressTestnetNonBounceable: walletOrgAddress,
      addressTestnetBounceable: walletOrgBounceable,
      rawAddress: walletOrgW5.address.toRawString(),
    },
    standardTestnetW5: {
      networkGlobalId: STANDARD_TESTNET_NETWORK_GLOBAL_ID,
      walletVersion: 'W5R1',
      subwalletNumber: 0,
      addressTestnetNonBounceable: standardTestnetAddress,
      rawAddress: standardTestnetW5.address.toRawString(),
    },
    matches,
  });

  if (matches.walletTonOrgRaw) {
    emit('RESULT', {
      status: 'WALLET_TON_ORG_MATCH',
      contractState: onChain.state,
      conclusion: 'THE_CONFIGURED_ADDRESS_IS_EXACTLY_THE_WALLET_TON_ORG_W5R1_ADDRESS_DERIVED_FROM_THE_CONFIGURED_MNEMONIC',
      nextAction: onChain.state === 'uninitialized'
        ? 'DO_NOT_SEND_PAYOUTS_YET; DEPLOY_THIS_EXACT_W5R1_WALLET_OR_USE_WALLET_TON_ORG_TO_INITIALIZE_IT'
        : 'PROCEED_TO_INDEPENDENT_SIGNER_VERIFICATION',
    });
    return;
  }

  if (matches.standardTestnetW5) {
    emit('RESULT', {
      status: 'STANDARD_TESTNET_MATCH_ONLY',
      contractState: onChain.state,
      conclusion: 'ADDRESS_MATCHES_STANDARD_TESTNET_W5R1_BUT_NOT_WALLET_TON_ORG_MAINNET_ID_BEHAVIOR',
      nextAction: 'DO_NOT_SEND; VERIFY_WHICH_ADDRESS_IS_ACTUALLY_DISPLAYED_AND_FUNDED_IN_WALLET_TON_ORG',
    });
    process.exitCode = 2;
    return;
  }

  emit('RESULT', {
    status: 'NO_WALLET_TON_ORG_MATCH',
    contractState: onChain.state,
    conclusion: 'THE_CONFIGURED_MNEMONIC_DOES_NOT_DERIVE_THE_CONFIGURED_ADDRESS_USING_THE_OFFICIAL_WALLET_TON_ORG_BIP39_W5R1_ALGORITHM',
    nextAction: 'DO_NOT_DEPLOY; DO_NOT_SIGN; DO_NOT_MOVE_FUNDS; VERIFY_THE_EXACT_MNEMONIC_IMPORTED_IN_WALLET_TON_ORG',
  });
  process.exitCode = 2;
}

main().catch((error) => {
  emit('FATAL', {
    name: error?.name || 'Error',
    message: String(error?.message || error),
  });
  process.exitCode = 1;
});
