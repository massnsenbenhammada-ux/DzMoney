const { TonClient, Address, WalletContractV5R1, WalletContractV4R2, WalletContractV3R2, WalletContractV2R2, WalletContractV1R3 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { sha256_sync } = require('@ton/crypto');

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
  emit('KEY', { wordCount: words.length, publicKeyHex: Buffer.from(keyPair.publicKey).toString('hex'), publicKeyFingerprint: short(Buffer.from(keyPair.publicKey).toString('hex')) });

  const matches = [];
  const candidates = [];
  const add = (version, wallet) => {
    if (!wallet) return;
    const address = normalize(wallet.address);
    const row = { version, address, match: address === treasuryNormalized };
    candidates.push(row);
    if (row.match) matches.push({ version, address, wallet });
  };

  if (hasCreate(WalletContractV5R1)) {
    add('v5r1:testnet-network-id--3', WalletContractV5R1.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -3, workchain: treasury.workChain, walletVersion: 0, subwalletNumber: 0 } }));
    add('v5r1:wallet-ton-org-legacy-network-id--239', WalletContractV5R1.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -239, workchain: treasury.workChain, walletVersion: 0, subwalletNumber: 0 } }));
  }
  if (hasCreate(WalletContractV4R2)) add('v4r2:subwallet-698983191', WalletContractV4R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: 698983191 }));
  if (hasCreate(WalletContractV3R2)) add('v3r2:subwallet-698983191', WalletContractV3R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: 698983191 }));
  if (hasCreate(WalletContractV2R2)) add('v2r2:subwallet-698983191', WalletContractV2R2.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: 698983191 }));
  if (hasCreate(WalletContractV1R3)) add('v1r3:subwallet-698983191', WalletContractV1R3.create({ workchain: treasury.workChain, publicKey: keyPair.publicKey, walletId: 698983191 }));

  emit('CANDIDATES', { count: candidates.length, candidates: candidates.map(({ version, address, match }) => ({ version, address, match })) });
  emit('MATCH', { count: matches.length, matches: matches.map(m => ({ version: m.version, address: m.address })) });

  if (matches.length === 1) {
    emit('RESULT', { status: 'UNIQUE_MATCH', signer: matches[0].version, address: matches[0].address, contractState: chain.state, nextAction: chain.state === 'uninitialized' ? 'DEPLOY_REQUIRED_BEFORE_PAYOUT' : 'READY_FOR_SIGNER_VERIFICATION' });
    return;
  }
  if (matches.length === 0) {
    emit('RESULT', { status: 'NO_MATCH', contractState: chain.state, nextAction: 'DO_NOT_DEPLOY_OR_SEND; FIX_WALLET_CONFIGURATION_FIRST' });
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
