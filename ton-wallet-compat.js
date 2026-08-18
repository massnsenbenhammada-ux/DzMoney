// Runtime compatibility for @ton/ton wallet exports.
// Keep this layer defensive: SDK versions expose slightly different wrapper names.
const ton = require('@ton/ton');

function loadExport(name, paths) {
  if (ton[name] && typeof ton[name].create === 'function') return;
  for (const path of paths) {
    try {
      const mod = require(path);
      const value = mod[name] || mod.default || mod;
      if (value && typeof value.create === 'function') {
        ton[name] = value;
        return;
      }
    } catch (_) {}
  }
  console.log(`TON wallet compat: ${name} unavailable`);
}

loadExport('WalletContractV5R1', [
  '@ton/ton/dist/wallets/WalletContractV5R1',
  '@ton/ton/dist/wallets/WalletContractV5R1.js'
]);
loadExport('WalletContractV4R2', [
  '@ton/ton/dist/wallets/WalletContractV4R2',
  '@ton/ton/dist/wallets/WalletContractV4R2.js'
]);
// Current @ton/ton commonly exports V4 as WalletContractV4.
if (!ton.WalletContractV4R2 && ton.WalletContractV4 && typeof ton.WalletContractV4.create === 'function') {
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
  v5r1: !!ton.WalletContractV5R1,
  v4r2: !!ton.WalletContractV4R2,
  v3r2: !!ton.WalletContractV3R2,
  v2r2: !!ton.WalletContractV2R2,
  v1r3: !!ton.WalletContractV1R3
}));
