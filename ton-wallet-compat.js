'use strict';

// Runtime compatibility for @ton/ton wallet exports and SLIP10.
// This module only normalizes SDK exports before payout-worker.js loads.
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

function normalizeSlip10CommonJS() {
  try {
    const resolved = require.resolve('micro-key-producer/slip10.js');
    const loaded = require(resolved);
    if (typeof loaded?.fromMasterSeed === 'function') return true;

    const defaultExport = loaded?.default;
    const HDKey = loaded?.HDKey || defaultExport?.HDKey || (typeof defaultExport === 'function' ? defaultExport : null);
    const factory = defaultExport?.fromMasterSeed || HDKey?.fromMasterSeed;
    if (typeof factory !== 'function') return false;

    // Recent micro-key-producer releases are ESM-first. Under CommonJS the
    // namespace may expose HDKey/default without a top-level fromMasterSeed.
    // Replace the cached namespace instead of mutating a possibly frozen ESM
    // namespace object. payout-worker.js will then receive the normalized API.
    const patched = {
      ...(loaded && typeof loaded === 'object' ? loaded : {}),
      HDKey: HDKey || loaded?.HDKey,
      default: defaultExport || HDKey,
      fromMasterSeed: factory.bind(HDKey || defaultExport)
    };
    require.cache[resolved].exports = patched;
    return true;
  } catch (_) {
    return false;
  }
}

if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

loadExport('WalletContractV5R1', [
  '@ton/ton/dist/wallets/v5r1/WalletContractV5R1',
  '@ton/ton/dist/wallets/v5r1/WalletContractV5R1.js'
]);
loadExport('WalletContractV5Beta', [
  '@ton/ton/dist/wallets/v5beta/WalletContractV5Beta',
  '@ton/ton/dist/wallets/v5beta/WalletContractV5Beta.js'
]);
loadExport('WalletContractV4R2', [
  '@ton/ton/dist/wallets/v4/WalletContractV4',
  '@ton/ton/dist/wallets/v4/WalletContractV4.js'
]);
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

if (!hasCreate(ton.WalletContractV4R2) && hasCreate(ton.WalletContractV4)) {
  ton.WalletContractV4R2 = ton.WalletContractV4;
}

const slip10Ready = normalizeSlip10CommonJS();
console.log('TON wallet compat: loaded', JSON.stringify({
  v5r1: hasCreate(ton.WalletContractV5R1),
  v5beta: hasCreate(ton.WalletContractV5Beta),
  v4r2: hasCreate(ton.WalletContractV4R2),
  v3r2: hasCreate(ton.WalletContractV3R2),
  v2r2: hasCreate(ton.WalletContractV2R2),
  v1r3: hasCreate(ton.WalletContractV1R3),
  v4Alias: hasCreate(ton.WalletContractV4),
  slip10FromMasterSeed: slip10Ready
}));

const required = [
  ['v5r1', ton.WalletContractV5R1],
  ['v5beta', ton.WalletContractV5Beta],
  ['v4r2', ton.WalletContractV4R2],
  ['v3r2', ton.WalletContractV3R2],
  ['v2r2', ton.WalletContractV2R2],
  ['v1r3', ton.WalletContractV1R3]
];
const unavailable = required.filter(([, C]) => !hasCreate(C)).map(([name]) => name);
if (unavailable.length) console.log(`TON wallet compat: unavailable adapters: ${unavailable.join(', ')}`);
if (!slip10Ready) console.log('TON wallet compat: SLIP10 unavailable; payout signer derivation will refuse to run.');
