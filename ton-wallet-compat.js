// Runtime compatibility for @ton/ton wallet exports.
// This layer normalizes SDK naming differences before payout-worker.js is loaded.
const ton = require('@ton/ton');

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

// @ton/ton 16.x exposes V4R2 as WalletContractV4. Normalize it even when a
// stale/non-functional WalletContractV4R2 property already exists.
if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

loadExport('WalletContractV5R1', [
  '@ton/ton/dist/wallets/WalletContractV5R1',
  '@ton/ton/dist/wallets/WalletContractV5R1.js'
]);

if (!hasCreate(ton.WalletContractV4R2)) {
  loadExport('WalletContractV4R2', [
    '@ton/ton/dist/wallets/WalletContractV4R2',
    '@ton/ton/dist/wallets/WalletContractV4R2.js'
  ]);
}

if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

loadExport('WalletContractV3R2', [
  '@ton/ton/dist/wallets/WalletContractV3R2',
  '@ton/ton/dist/wallets/WalletContractV3R2.js'
]);

loadExport('WalletContractV2R2', [
  '@ton/ton/dist/wallets/WalletContractV2R2',
  '@ton/ton/dist/wallets/WalletContractV2R2.js'
]);

loadExport('WalletContractV1R3', [
  '@ton/ton/dist/wallets/WalletContractV1R3',
  '@ton/ton/dist/wallets/WalletContractV1R3.js'
]);

console.log('TON wallet compat: loaded', JSON.stringify({
  v5r1: hasCreate(ton.WalletContractV5R1),
  v4r2: hasCreate(ton.WalletContractV4R2),
  v3r2: hasCreate(ton.WalletContractV3R2),
  v2r2: hasCreate(ton.WalletContractV2R2),
  v1r3: hasCreate(ton.WalletContractV1R3),
  v4Alias: hasCreate(ton.WalletContractV4)
}));

// Fail early and clearly if the payout worker's supported standard wallet
// adapters cannot be constructed. Never let payout-worker.js crash with
// "undefined.create" deep inside a verification loop.
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
