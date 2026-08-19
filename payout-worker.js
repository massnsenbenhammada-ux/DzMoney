'use strict';

const ton = require('@ton/ton');
const { mnemonicToPrivateKey, sha256_sync } = require('@ton/crypto');
const { mnemonicToSeedSync } = require('@scure/bip39');
const slip10 = require('micro-key-producer/slip10.js');
const { Pool } = require('pg');

const enabled = String(process.env.TON_PAYOUT_ENABLED || '').toLowerCase() === 'true';
const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const treasuryAddressRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const RPC = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined });

console.log('TON payout env check:', JSON.stringify({
  TON_PAYOUT_ENABLED: process.env.TON_PAYOUT_ENABLED ? 'PRESENT' : 'MISSING',
  TON_PAYOUT_NETWORK: process.env.TON_PAYOUT_NETWORK ? 'PRESENT' : 'MISSING',
  TON_TREASURY_MNEMONIC: process.env.TON_TREASURY_MNEMONIC ? 'PRESENT' : 'MISSING',
  TON_TREASURY_ADDRESS: process.env.TON_TREASURY_ADDRESS ? 'PRESENT' : 'MISSING'
}));
console.log('TON payout worker boot:', JSON.stringify({ enabled, network, database: !!process.env.DATABASE_URL, mnemonic: !!mnemonicRaw, treasuryAddress: !!treasuryAddressRaw, rpc: RPC, pollMs: POLL_MS }));

if (!enabled || network !== 'testnet') {
  console.log('TON payout worker: disabled or non-testnet; no payouts will be processed.');
  return;
}
if (!mnemonicRaw || !treasuryAddressRaw) {
  console.log('TON payout worker: treasury mnemonic/address missing; refusing to process payouts.');
  return;
}

const client = new ton.TonClient({ endpoint: RPC });
let busy = false;
let shuttingDown = false;
let walletContextPromise = null;
let walletActivationPending = false;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function normalizeAddress(value) { return ton.Address.parse(String(value)).toString({ bounceable: true, urlSafe: true }); }
function safeAddress(value) { return ton.Address.parse(String(value)); }
function hasCreate(C) { return !!C && typeof C.create === 'function'; }

function makeKeyPair(publicKey, privateKey) {
  const pub = Buffer.from(publicKey);
  const priv = Buffer.from(privateKey);
  return { publicKey: pub, secretKey: Buffer.concat([priv, pub]) };
}

function deriveMultichain(words) {
  const seed = mnemonicToSeedSync(words.join(' '), '');
  const root = slip10.fromMasterSeed(seed);
  const account = root.derive("m/44'/607'/0'");
  return makeKeyPair(account.publicKeyRaw, account.privateKey);
}

async function deriveKeyCandidates() {
  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) throw new Error(`Treasury mnemonic must contain 12 or 24 words; got ${words.length}.`);
  const out = [];
  const seen = new Set();
  const add = (scheme, keyPair) => {
    if (!keyPair?.publicKey || !keyPair?.secretKey) return;
    const fingerprint = Buffer.from(keyPair.publicKey).toString('hex');
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    out.push({ scheme, keyPair, publicKeyHex: fingerprint });
  };
  if (words.length === 12) {
    add('multichain-bip39:m/44\'/607\'/0\'', deriveMultichain(words));
  } else {
    try { add('ton', await mnemonicToPrivateKey(words)); } catch (_) {}
    try { add('multichain-bip39:m/44\'/607\'/0\'', deriveMultichain(words)); } catch (_) {}
  }
  return out;
}

function buildWalletCandidates(keyPair, workchain) {
  const out = [];
  const add = (version, wallet, metadata = {}) => wallet && out.push({ version, wallet, keyPair, ...metadata });
  if (hasCreate(ton.WalletContractV5R1)) {
    add('v5r1:testnet', ton.WalletContractV5R1.create({ workchain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -3, workchain, walletVersion: 0, subwalletNumber: 0 } }), { contract: 'v5r1', networkGlobalId: -3, subwalletNumber: 0 });
    add('v5r1:wallet-ton-org-legacy', ton.WalletContractV5R1.create({ workchain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -239, workchain, walletVersion: 0, subwalletNumber: 0 } }), { contract: 'v5r1', networkGlobalId: -239, subwalletNumber: 0, walletTonOrgLegacy: true });
  }
  if (hasCreate(ton.WalletContractV5Beta)) {
    add('v5beta:testnet', ton.WalletContractV5Beta.create({ workchain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -3, workchain, walletVersion: 'v5', subwalletNumber: 0 } }), { contract: 'v5beta', networkGlobalId: -3, subwalletNumber: 0 });
    add('v5beta:wallet-ton-org-legacy', ton.WalletContractV5Beta.create({ workchain, publicKey: keyPair.publicKey, walletId: { networkGlobalId: -239, workchain, walletVersion: 'v5', subwalletNumber: 0 } }), { contract: 'v5beta', networkGlobalId: -239, subwalletNumber: 0, walletTonOrgLegacy: true });
  }
  const id = 698983191;
  if (hasCreate(ton.WalletContractV4R2)) add('v4r2', ton.WalletContractV4R2.create({ workchain, publicKey: keyPair.publicKey, walletId: id }), { contract: 'v4r2', walletId: id });
  if (hasCreate(ton.WalletContractV3R2)) add('v3r2', ton.WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey, walletId: id }), { contract: 'v3r2', walletId: id });
  if (hasCreate(ton.WalletContractV2R2)) add('v2r2', ton.WalletContractV2R2.create({ workchain, publicKey: keyPair.publicKey, walletId: id }), { contract: 'v2r2', walletId: id });
  if (hasCreate(ton.WalletContractV1R3)) add('v1r3', ton.WalletContractV1R3.create({ workchain, publicKey: keyPair.publicKey, walletId: id }), { contract: 'v1r3', walletId: id });
  return out;
}

async function resolveTreasurySigner() {
  const treasury = safeAddress(treasuryAddressRaw);
  const configured = normalizeAddress(treasury);
  const keys = await deriveKeyCandidates();
  const matches = [];
  for (const key of keys) {
    for (const candidate of buildWalletCandidates(key.keyPair, treasury.workChain)) {
      if (normalizeAddress(candidate.wallet.address) === configured) matches.push({ ...candidate, scheme: key.scheme });
    }
  }

  if (!matches.length && hasCreate(ton.WalletContractV5R1)) {
    for (const key of keys) {
      for (const networkGlobalId of [-3, -239]) {
        for (let subwalletNumber = 0; subwalletNumber <= 0x7fff; subwalletNumber++) {
          const wallet = ton.WalletContractV5R1.create({ workchain: treasury.workChain, publicKey: key.keyPair.publicKey, walletId: { networkGlobalId, workchain: treasury.workChain, walletVersion: 0, subwalletNumber } });
          if (normalizeAddress(wallet.address) === configured) {
            matches.push({ version: `v5r1:network-${networkGlobalId}:subwallet-${subwalletNumber}`, contract: 'v5r1', wallet, keyPair: key.keyPair, scheme: key.scheme, networkGlobalId, subwalletNumber });
            break;
          }
        }
        if (matches.length) break;
      }
      if (matches.length) break;
    }
  }

  console.log('TON payout worker: signer candidates:', JSON.stringify({
    treasury: configured,
    keySchemes: keys.map(k => ({ scheme: k.scheme, publicKeyFingerprint: `${k.publicKeyHex.slice(0, 6)}…${k.publicKeyHex.slice(-6)}` })),
    matches: matches.map(m => ({ version: m.version, scheme: m.scheme, networkGlobalId: m.networkGlobalId, subwalletNumber: m.subwalletNumber }))
  }));
  if (matches.length !== 1) throw new Error(`Treasury signer verification failed for ${configured}. Unique matches=${matches.length}. Refusing to send.`);
  return { ...matches[0], treasuryAddress: treasury };
}

async function getWalletContext() {
  if (!walletContextPromise) {
    walletContextPromise = (async () => {
      const signer = await resolveTreasurySigner();
      const state = await client.getContractState(signer.treasuryAddress);
      const balance = state.balance || 0n;
      const codeHash = state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null;
      const willDeploy = state.state === 'uninitialized';
      console.log('TON payout worker: treasury identity:', JSON.stringify({ address: normalizeAddress(signer.treasuryAddress), state: state.state, balanceNano: balance.toString(), codeHash, signer: signer.version, mnemonicScheme: signer.scheme, networkGlobalId: signer.networkGlobalId, subwalletNumber: signer.subwalletNumber, willDeployOnFirstTransfer: willDeploy }));

      if (state.state === 'frozen') {
        throw new Error(`Treasury ${normalizeAddress(signer.treasuryAddress)} is frozen. Refusing to send.`);
      }
      if (state.state === 'uninitialized' && walletActivationPending) {
        throw new Error(`Treasury ${normalizeAddress(signer.treasuryAddress)} has a deployment broadcast pending. Waiting for on-chain activation; automatic resend is disabled.`);
      }
      return { ...signer, balance, state, codeHash, willDeploy };
    })().catch(error => { walletContextPromise = null; throw error; });
  }
  return walletContextPromise;
}

async function ensureSchema() {
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_started_at BIGINT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_seqno BIGINT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_error TEXT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_network TEXT`);
}

async function recoverProcessing() {
  const result = await pool.query(`SELECT id FROM withdrawals WHERE status='processing' ORDER BY id ASC LIMIT 20`);
  console.log(`TON payout worker: recoverProcessing OK (${result.rowCount} rows)`);
}

async function processWithdrawal(row) {
  const id = Number(row.id);
  const amountTon = Number(row.amount_ton);
  if (!Number.isFinite(amountTon) || amountTon <= 0) throw new Error(`Withdrawal #${id} has invalid TON amount.`);
  const destination = safeAddress(String(row.destination));
  const ctx = await getWalletContext();
  const amountNano = ton.toNano(amountTon.toFixed(9));
  const reserve = ton.toNano('0.05');
  if (ctx.balance < amountNano + reserve) throw new Error(`Treasury balance is insufficient. Need at least ${Number(amountNano + reserve) / 1e9} TON.`);

  const contract = client.open(ctx.wallet);
  // An uninitialized funded wallet has no on-chain seqno yet. V5 starts at seqno 0.
  // TonClient's provider automatically includes the contract StateInit on the first
  // external message when the wallet is not deployed, so the first payout can safely
  // activate the exact verified W5R1 treasury and perform the transfer atomically.
  const seqno = ctx.state === 'uninitialized' ? 0 : await ctx.wallet.getSeqno(contract);
  const locked = await pool.query(`UPDATE withdrawals SET status='processing', payout_started_at=$1, payout_attempts=COALESCE(payout_attempts,0)+1, payout_seqno=$2, payout_error='', payout_network='testnet', updated_at=$1 WHERE id=$3 AND status='approved' RETURNING id`, [Date.now(), seqno, id]);
  if (!locked.rowCount) return false;

  console.log(`TON payout worker: sending TESTNET withdrawal #${id}: ${amountTon} TON -> ${normalizeAddress(destination)} using ${ctx.version}/${ctx.scheme}${ctx.willDeploy ? ' (DEPLOY+PAYOUT)' : ''}`);
  try {
    await contract.sendTransfer({ seqno, secretKey: ctx.keyPair.secretKey, sendMode: ton.SendMode.PAY_GAS_SEPARATELY, messages: [ton.internal({ to: destination, value: amountNano, bounce: false })] });
  } catch (error) {
    await pool.query(`UPDATE withdrawals SET status='approved', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, [String(error?.message || error).slice(0, 2000), Date.now(), id]);
    throw error;
  }

  if (ctx.willDeploy) {
    walletActivationPending = true;
    walletContextPromise = null;
    console.log(`TON payout worker: first external message accepted for #${id}; W5R1 deployment is included. No second payout will be attempted until the treasury becomes active.`);
  }

  // Broadcasts are never automatically retried. This prevents duplicate payouts
  // when the provider accepted a message but returned a timeout/429.
  await pool.query(`UPDATE withdrawals SET status='processing', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, ['Broadcast accepted; blockchain reconciliation required. Automatic resend disabled.', Date.now(), id]);
  console.log(`TON payout worker: broadcast accepted for #${id}, seqno=${seqno}; no automatic resend.`);
  return true;
}

async function poll() {
  if (busy || shuttingDown) return;
  busy = true;
  try {
    console.log('TON payout worker: poll START');
    const result = await pool.query(`SELECT * FROM withdrawals WHERE status='approved' AND LOWER(COALESCE(payout_network,''))='testnet' ORDER BY id ASC LIMIT 5`);
    console.log(`TON payout worker: poll query OK (${result.rowCount} rows)`);
    for (const row of result.rows) {
      if (walletActivationPending) {
        console.log(`TON payout worker: treasury activation pending; leaving withdrawal #${row.id} approved and skipping additional sends.`);
        break;
      }
      console.log(`TON payout worker: found approved TESTNET withdrawal #${row.id}`);
      try { await processWithdrawal(row); } catch (error) { console.error('TON payout worker error:', error); }
    }
    console.log('TON payout worker: poll END');
  } catch (error) {
    console.error('TON payout worker poll error:', error);
  } finally {
    busy = false;
  }
}

(async () => {
  try {
    console.log('TON payout worker: startup START');
    await ensureSchema();
    console.log('TON payout worker: ensureSchema OK');
    await recoverProcessing();
    console.log('TON payout worker: initial poll START');
    await poll();
    if (!shuttingDown) {
      const timer = setInterval(() => poll().catch(error => console.error('TON payout worker scheduler error:', error)), POLL_MS);
      timer.unref?.();
      console.log(`TON payout worker: scheduler ACTIVE every ${POLL_MS}ms`);
    }
  } catch (error) {
    console.error('TON payout worker startup error:', error);
  }
})();

process.on('SIGTERM', () => { shuttingDown = true; pool.end().catch(() => {}); });
process.on('SIGINT', () => { shuttingDown = true; pool.end().catch(() => {}); });
