// Runtime compatibility for @ton/ton wallet exports.
// Normalizes SDK naming differences and handles the documented wallet.ton.org
// testnet V5 address derivation quirk without weakening signer verification.
const ton = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

function hasCreate(value) {
  return !!value && typeof value.create === 'function';
}

function loadExport(name, paths) {
  if (hasCreate(ton[name])) return ton[name];
  for (const path of paths) {
    try {
      const mod = require(path);
      const value = mod?.[name] || mod?.default || mod;
      if (hasCreate(value)) {
        ton[name] = value;
        return value;
      }
    } catch (_) {}
  }
  return null;
}

if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

loadExport('WalletContractV5R1', [
  '@ton/ton/dist/wallets/v5r1/WalletContractV5R1',
  '@ton/ton/dist/wallets/v5r1/WalletContractV5R1.js'
]);

if (!hasCreate(ton.WalletContractV4R2)) {
  loadExport('WalletContractV4R2', [
    '@ton/ton/dist/wallets/v4/WalletContractV4',
    '@ton/ton/dist/wallets/v4/WalletContractV4.js'
  ]);
}
if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

loadExport('WalletContractV3R2', [
  '@ton/ton/dist/wallets/v3/WalletContractV3R2',
  '@ton/ton/dist/wallets/v3/WalletContractV3R2.js'
]);
loadExport('WalletContractV2R2', [
  '@ton/ton/dist/wallets/v2/WalletContractV2R2',
  '@ton/ton/dist/wallets/v2/WalletContractV2R2.js'
]);
loadExport('WalletContractV1R3', [
  '@ton/ton/dist/wallets/v1/WalletContractV1R3',
  '@ton/ton/dist/wallets/v1/WalletContractV1R3.js'
]);

// wallet.ton.org documents a known testnet quirk: its V5 testnet address can
// be derived with the mainnet V5 wallet_id (0x7FFFFF11) instead of the normal
// testnet V5 wallet_id (0x7FFFFFFD). We only activate this compatibility mode
// when BOTH the configured treasury address AND the configured mnemonic prove
// that exact relationship. This never bypasses signer/address verification.
async function detectWalletTonOrgLegacyV5() {
  try {
    if (!hasCreate(ton.WalletContractV5R1)) return null;
    const rawMnemonic = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
    const configured = String(process.env.TON_TREASURY_ADDRESS || '').trim();
    const network = String(process.env.TON_PAYOUT_NETWORK || '').toLowerCase();
    if (!rawMnemonic || !configured || network !== 'testnet') return null;

    const words = rawMnemonic.split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) return null;
    const keyPair = await mnemonicToPrivateKey(words);
    const Address = ton.Address;
    const normalize = value => Address.parse(String(value)).toString({ bounceable: true, urlSafe: true });

    const normal = ton.WalletContractV5R1.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -3, workchain: 0, walletVersion: 0, subwalletNumber: 0 }
    });
    const legacy = ton.WalletContractV5R1.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
      walletId: { networkGlobalId: -239, workchain: 0, walletVersion: 0, subwalletNumber: 0 }
    });
    const configuredNormalized = normalize(configured);
    const normalAddress = normalize(normal.address);
    const legacyAddress = normalize(legacy.address);

    if (configuredNormalized === legacyAddress && configuredNormalized !== normalAddress) {
      return { mode: 'wallet.ton.org-v5-testnet-legacy', walletId: 2147483409, address: legacyAddress };
    }
    return { mode: 'standard', walletId: 2147483645, address: normalAddress };
  } catch (error) {
    console.log('TON wallet compat: V5 discovery unavailable:', error.message);
    return null;
  }
}

// Install the compatibility wrapper synchronously after the async detector
// resolves. payout-worker.js is loaded immediately afterwards by Node -r, so
// the resolver is started before the worker performs its first poll.
if (hasCreate(ton.WalletContractV5R1)) {
  const originalV5Create = ton.WalletContractV5R1.create.bind(ton.WalletContractV5R1);
  let detectedMode = null;
  let detectionPromise = detectWalletTonOrgLegacyV5().then(result => {
    detectedMode = result;
    if (result?.mode === 'wallet.ton.org-v5-testnet-legacy') {
      console.log('TON wallet compat: detected wallet.ton.org V5 testnet legacy address derivation; using wallet_id 0x7FFFFF11 only for the configured treasury.');
    } else if (result?.mode === 'standard') {
      console.log('TON wallet compat: V5 treasury address matches standard testnet wallet_id 0x7FFFFFFD.');
    }
    return result;
  }).catch(() => null);

  ton.WalletContractV5R1.create = function patchedV5Create(args = {}) {
    // The worker asks for networkGlobalId=-3. If the explicit treasury has
    // already been cryptographically proven to be wallet.ton.org's legacy V5
    // address, substitute only that wallet_id. All other V5 creations remain
    // untouched.
    if (detectedMode?.mode === 'wallet.ton.org-v5-testnet-legacy' && args?.walletId?.networkGlobalId === -3) {
      return originalV5Create({
        ...args,
        walletId: {
          networkGlobalId: -239,
          workchain: args.walletId.workchain ?? args.workchain ?? 0,
          walletVersion: args.walletId.walletVersion ?? 0,
          subwalletNumber: args.walletId.subwalletNumber ?? 0
        }
      });
    }
    return originalV5Create(args);
  };

  // Expose a promise for future code/tests without requiring consumers to
  // know how the compatibility decision is made.
  ton.__dzmoneyV5CompatibilityReady = () => detectionPromise;
}

console.log('TON wallet compat: loaded', JSON.stringify({
  v5r1: hasCreate(ton.WalletContractV5R1),
  v4r2: hasCreate(ton.WalletContractV4R2),
  v3r2: hasCreate(ton.WalletContractV3R2),
  v2r2: hasCreate(ton.WalletContractV2R2),
  v1r3: hasCreate(ton.WalletContractV1R3),
  v4Alias: hasCreate(ton.WalletContractV4)
}));

const required = [
  ['v5r1', ton.WalletContractV5R1],
  ['v4r2', ton.WalletContractV4R2],
  ['v3r2', ton.WalletContractV3R2],
  ['v2r2', ton.WalletContractV2R2],
  ['v1r3', ton.WalletContractV1R3]
];
const unavailable = required.filter(([, C]) => !hasCreate(C)).map(([name]) => name);
if (unavailable.length) {
  console.log(`TON wallet compat: unavailable adapters: ${unavailable.join(', ')}`);
}
