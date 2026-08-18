const { TonClient, Address, WalletContractV5R1, WalletContractV4R2, WalletContractV3R2, WalletContractV2R2, WalletContractV1R3 } = require('@ton/ton');
const { mnemonicToPrivateKey, sha256_sync } = require('@ton/crypto');

const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const configuredRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const rpc = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');

function normalize(value) {
  return Address.parse(String(value)).toString({ bounceable: true, urlSafe: true });
}
function short(value) {
  const s = String(value || '');
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s;
}
function hasCreate(C) { return !!C && typeof C.create === 'function'; }
function emit(stage, data) { console.log(`TON DIAGNOSTIC ${stage}: ${JSON.stringify(data)}`); }

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

  const treasury = Address.parse(configuredRaw);
  const treasuryNormalized = normalize(treasury);
  emit('TREASURY', { address: treasuryNormalized, workchain: treasury.workChain });

  const client = new TonClient({ endpoint: rpc });
  const chain = await inspect(client, treasury);
  emit('ON_CHAIN', chain);

  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) throw new Error(`Mnemonic must contain 12 or 24 words; got ${words.length}.`);
  const keyPair = await mnemonicToPrivateKey(words);
  const publicKeyHex = Buffer.from(keyPair.publicKey).toString('hex');
  emit('KEY', { wordCount: words.length, publicKeyHex, publicKeyFingerprint: short(publicKeyHex) });

  const matches = [];
  const candidates = [];
  const seen = new Set();
  const add = (version, wallet, metadata = {}) => {
    if (!wallet) return;
    const address = normalize(wallet.address);
    const key = `${version}|${address}`;
    if (seen.has(key)) return;
    seen.add(key);
    const row = { version, address, ...metadata, match: address === treasuryNormalized };
    candidates.push(row);
    if (row.match) matches.push({ version, address, wallet, ...metadata });
  };

  // V5R1 is the important case for wallet.ton.org. The official V5 scheme
  // derives wallet_id from network_global_id + client context + subwallet number.
  // Scan the complete 15-bit client subwallet range instead of guessing only 0.
  if (hasCreate(WalletContractV5R1)) {
    for (const networkGlobalId of [-3, -239]) {
      for (let subwalletNumber = 0; subwalletNumber <= 0x7fff; subwalletNumber++) {
        const wallet = WalletContractV5R1.create({
          workchain: treasury.workChain,
          publicKey: keyPair.publicKey,
          walletId: {
            networkGlobalId,
            workchain: treasury.workChain,
            walletVersion: 0,
            subwalletNumber
          }
        });
        const address = normalize(wallet.address);
        if (address === treasuryNormalized) {
          add(`v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`, wallet, { networkGlobalId, subwalletNumber });
          break;
        }
      }
    }
  }

  // Legacy wallet families use a 32-bit wallet/subwallet id. Keep the known
  // official default as an additional compatibility check.
  const legacyWalletId = 698983191;
  if (hasCreate(WalletContractV4R2)) add('v4r2:subwallet-698983191', WalletContractV4R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: legacyWalletId }));
  if (hasCreate(WalletContractV3R2)) add('v3r2:subwallet-698983191', WalletContractV3R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: legacyWalletId }));
  if (hasCreate(WalletContractV2R2)) add('v2r2:subwallet-698983191', WalletContractV2R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: legacyWalletId }));
  if (hasCreate(WalletContractV1R3)) add('v1r3:subwallet-698983191', WalletContractV1R3.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: legacyWalletId }));

  emit('CANDIDATES', {
    scannedV5Subwallets: hasCreate(WalletContractV5R1) ? 65536 : 0,
    legacyCandidates: 4,
    count: candidates.length,
    candidates: candidates.map(({ version, address, match, networkGlobalId, subwalletNumber }) => ({ version, address, match, ...(networkGlobalId !== undefined ? { networkGlobalId } : {}), ...(subwalletNumber !== undefined ? { subwalletNumber } : {}) }))
  });
  emit('MATCH', { count: matches.length, matches: matches.map(m => ({ version: m.version, address: m.address, ...(m.networkGlobalId !== undefined ? { networkGlobalId: m.networkGlobalId } : {}), ...(m.subwalletNumber !== undefined ? { subwalletNumber: m.subwalletNumber } : {}) })) });

  if (matches.length === 1) {
    emit('RESULT', {
      status: 'UNIQUE_MATCH',
      signer: matches[0].version,
      address: matches[0].address,
      networkGlobalId: matches[0].networkGlobalId,
      subwalletNumber: matches[0].subwalletNumber,
      contractState: chain.state,
      nextAction: chain.state === 'uninitialized' ? 'DEPLOY_REQUIRED_BEFORE_PAYOUT' : 'READY_FOR_SIGNER_VERIFICATION'
    });
    return;
  }
  if (matches.length === 0) {
    emit('RESULT', { status: 'NO_MATCH', contractState: chain.state, nextAction: 'DO_NOT_DEPLOY_OR_SEND; WALLET ADDRESS IS NOT DERIVED BY SUPPORTED CONFIGURATIONS' });
    process.exitCode = 2;
    return;
  }
  emit('RESULT', { status: 'AMBIGUOUS', count: matches.length, contractState: chain.state, nextAction: 'DO_NOT_SEND; CONFIGURATION_IS_NOT_UNIQUE' });
  process.exitCode = 3;
}

main().catch(error => {
  emit('FATAL', { name: error?.name || 'Error', message: String(error?.message || error) });
  process.exitCode = 1;
});
