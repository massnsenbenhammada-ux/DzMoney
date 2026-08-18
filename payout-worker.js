const { TonClient, WalletContractV5R1, WalletContractV4R2, WalletContractV3R2, WalletContractV2R2, WalletContractV1R3, WalletContractV4, Address, Cell, beginCell, external, internal, SendMode, toNano, contractAddress, StateInit, loadStateInit } = require('@ton/ton');
const { mnemonicToPrivateKey, mnemonicNew, keyPairFromSeed, sha256_sync } = require('@ton/crypto');
const { Pool } = require('pg');

const enabled = String(process.env.TON_PAYOUT_ENABLED || '').toLowerCase() === 'true';
const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const treasuryAddressRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const mnemonicType = String(process.env.TON_TREASURY_MNEMONIC_TYPE || 'auto').toLowerCase();
const RPC = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !/localhost|127\\.0\\.1/i.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined });

console.log('TON payout env check:', JSON.stringify({
  TON_PAYOUT_ENABLED: process.env.TON_PAYOUT_ENABLED ? 'PRESENT' : 'MISSING',
  TON_PAYOUT_NETWORK: process.env.TON_PAYOUT_NETWORK ? 'PRESENT' : 'MISSING',
  TON_TREASURY_MNEMONIC: process.env.TON_TREASURY_MNEMONIC ? 'PRESENT' : 'MISSING',
  TON_TREASURY_ADDRESS: process.env.TON_TREASURY_ADDRESS ? 'PRESENT' : 'MISSING',
  TON_TREASURY_MNEMONIC_TYPE: mnemonicType
}));
console.log('TON payout worker boot:', JSON.stringify({ enabled, network, database: !!process.env.DATABASE_URL, mnemonic: !!mnemonicRaw, treasuryAddress: !!treasuryAddressRaw, mnemonicType, rpc: RPC, pollMs: POLL_MS }));

if (!enabled || network !== 'testnet') {
  console.log('TON payout worker: disabled or non-testnet; no payouts will be processed.');
  return;
}
if (!mnemonicRaw || !treasuryAddressRaw) {
  console.log('TON payout worker: treasury mnemonic/address missing; refusing to process payouts.');
  return;
}
console.log('TON payout worker: ENABLED, TESTNET ONLY; universal wallet diagnostics mode');

const client = new TonClient({ endpoint: RPC });
let busy = false;
let shuttingDown = false;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeAddress(value) { return Address.parse(String(value)); }
function normalizeAddress(value) { return safeAddress(value).toString({ bounceable: true, urlSafe: true }); }
function redact(value) { const s = String(value || ''); return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : '***'; }

async function ensureSchema() {
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_started_at BIGINT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_seqno BIGINT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_error TEXT`);
  await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_network TEXT`);
}

async function getTreasuryBalance() {
  const address = safeAddress(treasuryAddressRaw);
  return client.getBalance(address);
}

async function getAccountState() {
  const address = safeAddress(treasuryAddressRaw);
  const state = await client.getContractState(address);
  return state;
}

function describeState(state) {
  return {
    state: state.state,
    balance: state.balance?.toString?.() || '0',
    codeHash: state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null,
    dataHash: state.data ? sha256_sync(state.data.toBoc()).toString('hex') : null,
    codeBits: state.code?.bits?.length ?? null,
    dataBits: state.data?.bits?.length ?? null
  };
}

async function diagnoseTreasury() {
  const address = safeAddress(treasuryAddressRaw);
  const state = await getAccountState();
  const info = describeState(state);
  console.log('TON payout worker: treasury on-chain identity:', JSON.stringify({
    address: normalizeAddress(address),
    state: info.state,
    balanceNano: info.balance,
    codeHash: info.codeHash,
    dataHash: info.dataHash,
    codeBits: info.codeBits,
    dataBits: info.dataBits
  }));
  if (state.state !== 'active' || !state.code || !state.data) {
    throw new Error(`Treasury account is not an active smart contract (state=${state.state}).`);
  }
  return { address, state, info };
}

async function deriveCandidates() {
  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) throw new Error(`Treasury mnemonic must contain 12 or 24 words; got ${words.length}.`);
  const candidates = [];
  const add = async (type, keyPair) => {
    if (!keyPair?.publicKey || !keyPair?.secretKey) return;
    candidates.push({ type, keyPair });
  };
  if (mnemonicType === 'ton' || mnemonicType === 'auto') {
    try { await add('ton', await mnemonicToPrivateKey(words)); } catch (e) { console.log('TON mnemonic derivation candidate unavailable:', e.message); }
  }
  if (mnemonicType === 'bip39' || mnemonicType === 'multichain' || mnemonicType === 'auto') {
    if (words.length === 24) {
      try { await add('ton-24', await mnemonicToPrivateKey(words)); } catch (e) { console.log('24-word derivation candidate unavailable:', e.message); }
    }
  }
  return candidates;
}

async function detectWalletKinds(address) {
  const result = [];
  const state = await client.getContractState(address);
  const hash = state.code ? sha256_sync(state.code.toBoc()).toString('hex') : null;
  result.push({ codeHash: hash, state: state.state });
  return result;
}

function getAvailableWalletFactories(treasury) {
  const defs = [
    ['v5r1', WalletContractV5R1, { workchain: treasury.workChain, walletId: { networkGlobalId: -3, workchain: treasury.workChain, subwalletNumber: 0 } }],
    ['v4r2', WalletContractV4R2 || WalletContractV4, { workchain: treasury.workChain, walletId: 698983191 }],
    ['v3r2', WalletContractV3R2, { workchain: treasury.workChain, walletId: 698983191 }],
    ['v2r2', WalletContractV2R2, { workchain: treasury.workChain, walletId: 698983191 }],
    ['v1r3', WalletContractV1R3, { workchain: treasury.workChain, walletId: 698983191 }]
  ];
  return defs.filter(([, C]) => C && typeof C.create === 'function');
}

async function verifySignerCandidates() {
  const treasury = safeAddress(treasuryAddressRaw);
  const diagnostics = await detectWalletKinds(treasury);
  const candidates = await deriveCandidates();
  console.log('TON payout worker: signer verification diagnostics:', JSON.stringify({
    treasury: normalizeAddress(treasury),
    detected: diagnostics,
    candidates: candidates.map(c => c.type)
  }));
  if (!candidates.length) throw new Error('No usable mnemonic derivation candidate available. Refusing to send.');

  const matches = [];
  for (const candidate of candidates) {
    for (const [version, Contract, base] of getAvailableWalletFactories(treasury)) {
      try {
        const wallet = Contract.create({ ...base, publicKey: candidate.keyPair.publicKey });
        const derived = wallet.address.toString({ bounceable: true, urlSafe: true });
        if (normalizeAddress(derived) === normalizeAddress(treasury)) {
          matches.push({ version, candidate: candidate.type, address: derived, keyPair: candidate.keyPair });
        }
      } catch (error) {
        console.log(`TON payout worker: wallet candidate ${version}/${candidate.type} unavailable: ${error.message}`);
      }
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Universal signer verification could not establish a unique match for treasury ${normalizeAddress(treasury)}. Matches=${matches.length}. Refusing to send.`);
  }
  console.log(`TON payout worker: signer verified: ${matches[0].version}/${matches[0].candidate} -> ${normalizeAddress(treasury)}`);
  return matches[0];
}

async function getWalletContext() {
  const treasury = safeAddress(treasuryAddressRaw);
  const balance = await getTreasuryBalance();
  console.log(`TON payout worker: configured TESTNET treasury ${normalizeAddress(treasury)} balance ${Number(balance) / 1e9} TON`);
  const signer = await verifySignerCandidates();
  const factories = getAvailableWalletFactories(treasury);
  const selected = factories.find(([version]) => version === signer.version);
  if (!selected) throw new Error(`Verified wallet wrapper ${signer.version} is unavailable. Refusing to send.`);
  const [, Contract, base] = selected;
  const wallet = Contract.create({ ...base, publicKey: signer.keyPair.publicKey });
  return { client, treasuryAddress: treasury, balance, keyPair: signer.keyPair, wallet, identity: { version: signer.version, candidate: signer.candidate } };
}

async function recoverProcessing() {
  console.log('TON payout worker: recoverProcessing START');
  const result = await pool.query(`SELECT id,payout_error FROM withdrawals WHERE status='processing' ORDER BY id ASC LIMIT 20`);
  console.log(`TON payout worker: recoverProcessing OK (${result.rowCount} rows)`);
  for (const row of result.rows) console.log(`TON payout worker: withdrawal #${row.id} remains processing; no automatic resend. ${row.payout_error || ''}`);
}

async function sendWithDetectedWallet(ctx, seqno, destination, amountNano) {
  const contract = ctx.client.open(ctx.wallet);
  const msg = internal({ to: destination, value: amountNano, bounce: false });
  const common = { seqno, secretKey: ctx.keyPair.secretKey, sendMode: SendMode.PAY_GAS_SEPARATELY };
  await contract.sendTransfer({ ...common, messages: [msg] });
}
