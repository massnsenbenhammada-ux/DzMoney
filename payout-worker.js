'use strict';

// DzMoney TON payout worker
// TESTNET only. Exact Wallet V5R1 Testnet signer. No legacy/Mainnet-ID fallbacks.
// Broadcast attempts are never automatically retried: a timeout/429 may happen
// after the RPC accepted the external message, so retrying could double-pay.

const ton = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { mnemonicToSeedSync } = require('@scure/bip39');
const slip10 = require('micro-key-producer/slip10.js');
const { Pool } = require('pg');

const enabled = String(process.env.TON_PAYOUT_ENABLED || '').toLowerCase() === 'true';
const network = String(process.env.TON_PAYOUT_NETWORK || 'testnet').toLowerCase();
const mnemonicRaw = String(process.env.TON_TREASURY_MNEMONIC || '').trim();
const treasuryAddressRaw = String(process.env.TON_TREASURY_ADDRESS || '').trim();
const RPC = String(process.env.TON_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC');
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));
const RESERVE_NANO = ton.toNano(String(process.env.TON_PAYOUT_RESERVE_TON || '0.05'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined,
});

console.log('TON payout env check:', JSON.stringify({
  TON_PAYOUT_ENABLED: process.env.TON_PAYOUT_ENABLED ? 'PRESENT' : 'MISSING',
  TON_PAYOUT_NETWORK: process.env.TON_PAYOUT_NETWORK ? 'PRESENT' : 'MISSING',
  TON_TREASURY_MNEMONIC: process.env.TON_TREASURY_MNEMONIC ? 'PRESENT' : 'MISSING',
  TON_TREASURY_ADDRESS: process.env.TON_TREASURY_ADDRESS ? 'PRESENT' : 'MISSING',
  TON_TREASURY_MNEMONIC_TYPE: process.env.TON_TREASURY_MNEMONIC_TYPE || 'default',
}));

console.log('TON payout worker boot:', JSON.stringify({
  enabled,
  network,
  database: !!process.env.DATABASE_URL,
  mnemonic: !!mnemonicRaw,
  treasuryAddress: !!treasuryAddressRaw,
  mnemonicType: process.env.TON_TREASURY_MNEMONIC_TYPE || 'default',
  rpc: RPC,
  pollMs: POLL_MS,
  walletContract: 'W5R1',
  walletNetworkGlobalId: -3,
  subwalletNumber: 0,
}));

if (!enabled || network !== 'testnet') {
  console.log('TON payout worker: disabled or non-testnet; no payouts will be processed.');
  return;
}
if (!mnemonicRaw || !treasuryAddressRaw) {
  console.log('TON payout worker: treasury mnemonic/address missing; refusing to process payouts.');
  return;
}

const client = new ton.TonClient({
  endpoint: RPC,
  ...(process.env.TONCENTER_API_KEY ? { apiKey: process.env.TONCENTER_API_KEY } : {}),
});

let busy = false;
let shuttingDown = false;
let walletContextPromise = null;

function normalizeAddress(value, options = {}) {
  return ton.Address.parse(String(value)).toString({
    bounceable: options.bounceable ?? true,
    urlSafe: true,
    testOnly: options.testOnly ?? false,
  });
}

function safeAddress(value) {
  return ton.Address.parse(String(value));
}

function deriveMultichainKey(words) {
  const seed = mnemonicToSeedSync(words.join(' '), '');
  const root = slip10.fromMasterSeed(seed);
  const account = root.derive("m/44'/607'/0'");
  const publicKey = Buffer.from(account.publicKeyRaw);
  const privateKey = Buffer.from(account.privateKey);
  return {
    publicKey,
    secretKey: Buffer.concat([privateKey, publicKey]),
    scheme: "wallet.ton.org:bip39:m/44'/607'/0'",
  };
}

async function deriveTreasuryKey() {
  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(`Treasury mnemonic must contain 12 or 24 words; got ${words.length}.`);
  }
  // The current Gram Wallet import is 12 words and the diagnostic proved this
  // key derives the configured W5 Testnet address. Keep 24-word compatibility.
  if (words.length === 12) return deriveMultichainKey(words);
  const keyPair = await mnemonicToPrivateKey(words);
  return { publicKey: Buffer.from(keyPair.publicKey), secretKey: Buffer.from(keyPair.secretKey), scheme: 'ton-mnemonic' };
}

function createTreasuryWallet(publicKey) {
  if (!ton.WalletContractV5R1 || typeof ton.WalletContractV5R1.create !== 'function') {
    throw new Error('Installed @ton/ton does not expose WalletContractV5R1.create().');
  }

  // Exact standard W5R1 Testnet configuration documented by TON:
  // networkGlobalId=-3, workchain=0, walletVersion=0, subwalletNumber=0.
  return ton.WalletContractV5R1.create({
    workchain: 0,
    publicKey,
    walletId: {
      networkGlobalId: -3,
      workchain: 0,
      walletVersion: 0,
      subwalletNumber: 0,
    },
  });
}

async function resolveTreasurySigner() {
  const configured = safeAddress(treasuryAddressRaw);
  const keyPair = await deriveTreasuryKey();
  const wallet = createTreasuryWallet(keyPair.publicKey);

  const configuredRaw = configured.toRawString();
  const derivedRaw = wallet.address.toRawString();
  const match = configuredRaw === derivedRaw;

  console.log('TON payout worker: exact W5R1 Testnet signer verification:', JSON.stringify({
    configuredAddress: normalizeAddress(configured, { bounceable: false, testOnly: true }),
    configuredRaw,
    derivedAddress: normalizeAddress(wallet.address, { bounceable: false, testOnly: true }),
    derivedRaw,
    match,
    contract: 'W5R1',
    network: 'testnet',
    networkGlobalId: -3,
    workchain: 0,
    walletVersion: 0,
    subwalletNumber: 0,
    mnemonicScheme: keyPair.scheme,
  }));

  if (!match) {
    throw new Error(
      `Treasury signer verification failed: configured ${configuredRaw} != derived ${derivedRaw}. Refusing to sign.`,
    );
  }

  return { wallet, keyPair, treasuryAddress: configured };
}

async function getWalletContext() {
  if (!walletContextPromise) {
    walletContextPromise = (async () => {
      const signer = await resolveTreasurySigner();
      const state = await client.getContractState(signer.treasuryAddress);
      const balance = state.balance || 0n;

      console.log('TON payout worker: treasury identity:', JSON.stringify({
        address: normalizeAddress(signer.treasuryAddress, { bounceable: false, testOnly: true }),
        rawAddress: signer.treasuryAddress.toRawString(),
        state: state.state,
        balanceNano: balance.toString(),
        contract: 'W5R1',
        network: 'testnet',
        networkGlobalId: -3,
        workchain: 0,
        subwalletNumber: 0,
        firstTransferDeploys: state.state === 'uninitialized',
      }));

      if (state.state === 'frozen') {
        throw new Error(`Treasury ${signer.treasuryAddress.toRawString()} is frozen. Refusing to send.`);
      }

      return { ...signer, balance, state };
    })().catch(error => {
      walletContextPromise = null;
      throw error;
    });
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
  const result = await pool.query(`
    SELECT id, payout_attempts, payout_seqno, payout_error
    FROM withdrawals
    WHERE status='processing'
    ORDER BY id ASC
    LIMIT 20
  `);

  if (result.rowCount) {
    console.log('TON payout worker: recoverProcessing SAFETY HOLD:', JSON.stringify({
      rows: result.rows,
      action: 'NO_AUTOMATIC_RETRY_AFTER_BROADCAST_ATTEMPT',
    }));
  } else {
    console.log('TON payout worker: recoverProcessing OK (0 rows)');
  }
}

async function processWithdrawal(row) {
  const id = Number(row.id);
  const amountTon = Number(row.amount_ton);
  if (!Number.isFinite(amountTon) || amountTon <= 0) {
    throw new Error(`Withdrawal #${id} has invalid TON amount.`);
  }

  const destination = safeAddress(String(row.destination));
  const ctx = await getWalletContext();
  const amountNano = ton.toNano(amountTon.toFixed(9));

  if (ctx.balance < amountNano + RESERVE_NANO) {
    throw new Error(`Treasury balance is insufficient. Need at least ${(Number(amountNano + RESERVE_NANO) / 1e9).toFixed(9)} TON.`);
  }

  const provider = client.provider(ctx.wallet.address);
  const seqno = ctx.state === 'uninitialized' ? 0 : await ctx.wallet.getSeqno(provider);

  const locked = await pool.query(`
    UPDATE withdrawals
    SET status='processing',
        payout_started_at=$1,
        payout_attempts=COALESCE(payout_attempts,0)+1,
        payout_seqno=$2,
        payout_error='',
        payout_network='testnet',
        updated_at=$1
    WHERE id=$3 AND status='approved'
    RETURNING id
  `, [Date.now(), seqno, id]);

  if (!locked.rowCount) return false;

  console.log(`TON payout worker: SEND START #${id}: ${amountTon} TESTNET TON -> ${normalizeAddress(destination, { bounceable: false, testOnly: true })}${ctx.state === 'uninitialized' ? ' (DEPLOY+PAYOUT)' : ''}`);

  try {
    // Official low-level @ton/ton W5R1 flow. The exact wallet object that was
    // address-verified above performs the signature and broadcast.
    await ctx.wallet.sendTransfer(provider, {
      seqno,
      secretKey: ctx.keyPair.secretKey,
      sendMode: ton.SendMode.PAY_GAS_SEPARATELY,
      messages: [
        ton.internal({
          to: destination,
          value: amountNano,
          bounce: false,
        }),
      ],
    });
  } catch (error) {
    // Do NOT revert to approved. A 429/timeout can occur after Toncenter accepts
    // the external message. Leaving the row in processing prevents a double pay.
    const message = String(error?.message || error).slice(0, 2000);
    await pool.query(`
      UPDATE withdrawals
      SET payout_error=$1, updated_at=$2
      WHERE id=$3 AND status='processing'
    `, [`BROADCAST_ATTEMPT_UNCONFIRMED: ${message}`, Date.now(), id]);
    throw error;
  }

  await pool.query(`
    UPDATE withdrawals
    SET payout_error=$1, updated_at=$2
    WHERE id=$3 AND status='processing'
  `, [
    ctx.state === 'uninitialized'
      ? 'Broadcast accepted; W5R1 deployment + payout submitted. Await blockchain confirmation before marking paid.'
      : 'Broadcast accepted; await blockchain confirmation before marking paid.',
    Date.now(),
    id,
  ]);

  console.log(`TON payout worker: SEND ACCEPTED #${id}: seqno=${seqno}; status remains processing until blockchain reconciliation.`);
  return true;
}

async function poll() {
  if (busy || shuttingDown) return;
  busy = true;
  try {
    console.log('TON payout worker: poll START');
    console.log('TON payout worker: querying approved TESTNET withdrawals');

    const result = await pool.query(`
      SELECT * FROM withdrawals
      WHERE status='approved'
        AND LOWER(COALESCE(payout_network,''))='testnet'
      ORDER BY id ASC
      LIMIT 5
    `);

    console.log(`TON payout worker: poll query OK (${result.rowCount} rows)`);

    for (const row of result.rows) {
      console.log(`TON payout worker: found approved TESTNET withdrawal #${row.id}`);
      try {
        await processWithdrawal(row);
      } catch (error) {
        console.error('TON payout worker error:', error);
      }
    }

    console.log('TON payout worker: poll END');
  } catch (error) {
    console.error('TON payout worker poll error:', error);
  } finally {
    busy = false;
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`TON payout worker: ${signal} received; shutting down safely.`);
  try { await pool.end(); } catch (_) {}
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

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
