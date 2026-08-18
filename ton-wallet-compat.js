// Runtime compatibility for @ton/ton wallet exports.
// Some package builds expose wallet wrappers from internal paths but omit a
// top-level export. Populate the cached module before payout-worker.js loads.
const ton = require('@ton/ton');

function loadExport(name, path) {
  if (ton[name] && typeof ton[name].create === 'function') return;
  try {
    const mod = require(path);
    const value = mod[name] || mod.default || mod;
    if (value && typeof value.create === 'function') ton[name] = value;
  } catch (error) {
    console.log(`TON wallet compat: ${name} unavailable: ${error.message}`);
  }
}

loadExport('WalletContractV5R1', '@ton/ton/dist/wallets/WalletContractV5R1');
loadExport('WalletContractV4R2', '@ton/ton/dist/wallets/WalletContractV4R2');
loadExport('WalletContractV3R2', '@ton/ton/dist/wallets/WalletContractV3R2');
loadExport('WalletContractV2R2', '@ton/ton/dist/wallets/WalletContractV2R2');
loadExport('WalletContractV1R3', '@ton/ton/dist/wallets/WalletContractV1R3');

console.log('TON wallet compat: loaded', JSON.stringify({
  v5r1: !!ton.WalletContractV5R1,
  v4r2: !!ton.WalletContractV4R2,
  v3r2: !!ton.WalletContractV3R2,
  v2r2: !!ton.WalletContractV2R2,
  v1r3: !!ton.WalletContractV1R3
}));
