const { Pool } = require("pg");
const { Address, TonClient, WalletContractV5R1, SendMode, internal, toNano } = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");

const DATABASE_URL = process.env.DATABASE_URL;
const ENABLED = String(process.env.TON_PAYOUT_ENABLED || "false").toLowerCase() === "true";
const NETWORK = String(process.env.TON_PAYOUT_NETWORK || "testnet").toLowerCase();
const MNEMONIC = String(process.env.TON_TREASURY_MNEMONIC || "").trim();
const RPC_ENDPOINT = process.env.TON_RPC_ENDPOINT || "https://testnet.toncenter.com/api/v2/jsonRPC";
const RPC_API_KEY = String(process.env.TONCENTER_API_KEY || "").trim();
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));
const CONFIRM_TIMEOUT_MS = Math.max(30000, Number(process.env.TON_PAYOUT_CONFIRM_TIMEOUT_MS || 120000));

if (!ENABLED) {
  console.log("TON payout worker: disabled");
  module.exports = {};
  return;
}

if (NETWORK !== "testnet") {
  console.error("TON payout worker: REFUSING TO START. This worker is testnet-only. Set TON_PAYOUT_NETWORK=testnet.");
  module.exports = {};
  return;
}

if (!DATABASE_URL) {
  console.error("TON payout worker: DATABASE_URL is missing.");
  module.exports = {};
  return;
}

if (!MNEMONIC) {
  console.error("TON payout worker: TON_TREASURY_MNEMONIC is missing. Worker will stay idle.");
  module.exports = {};
  return;
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

let walletContextPromise = null;
let busy = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWalletContext() {
  if (!walletContextPromise) {
    walletContextPromise = (async () => {
      const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(/\s+/));
      const wallet = WalletContractV5R1.create({
        walletId: { networkGlobalId: -3 },
        publicKey: keyPair.publicKey,
        workchain: 0
      });
      const client = new TonClient({
        endpoint: RPC_ENDPOINT,
        apiKey: RPC_API_KEY || undefined
      });
      const contract = client.open(wallet);
      const balance = await contract.getBalance();
      console.log("TON payout worker: TESTNET treasury", wallet.address.toString(), "balance", Number(balance) / 1e9, "TON");
      return { keyPair, wallet, client, contract };
    })();
  }
  return walletContextPromise;
}

async function ensureSchema() {
  await pool.query(`
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_seqno BIGINT;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_started_at BIGINT;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_error TEXT NOT NULL DEFAULT '';
  `);
}

async function findRecentTransactionHash(client, address, beforeSeqno) {
  try {
    const txs = await client.getTransactions(address, { limit: 10 });
    for (const tx of txs) {
      const txHash = tx.hash().toString("hex");
      const desc = tx.description;
      if (desc && typeof desc === "object" && Number(desc.seqno) === Number(beforeSeqno)) {
        return txHash;
      }
    }
    if (txs.length) return txs[0].hash().toString("hex");
  } catch (error) {
    console.error("TON transaction lookup failed:", error.message);
  }
  return "";
}

async function waitForConfirmation({ contract, client, treasuryAddress, destination, amountNano, seqnoBefore, recipientBalanceBefore }) {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let lastBalance = recipientBalanceBefore;
  while (Date.now() < deadline) {
    const seqnoNow = await contract.getSeqno();
    let recipientBalance = null;
    try {
      recipientBalance = await client.getBalance(destination);
      lastBalance = recipientBalance;
    } catch (_) {}

    if (seqnoNow !== seqnoBefore) {
      const hash = await findRecentTransactionHash(client, treasuryAddress, seqnoBefore);
      const receivedDelta = recipientBalance === null ? null : recipientBalance - recipientBalanceBefore;
      if (receivedDelta === null || receivedDelta >= amountNano) {
        return { confirmed: true, hash, recipientBalance, receivedDelta };
      }
      return { confirmed: false, hash, recipientBalance, receivedDelta };
    }
    await sleep(1500);
  }
  return { confirmed: false, hash: "", recipientBalance: lastBalance, receivedDelta: lastBalance === null ? null : lastBalance - recipientBalanceBefore };
}

async function processWithdrawal(row) {
  const id = Number(row.id);
  const amountTon = Number(row.amount_ton);
  if (!Number.isFinite(amountTon) || amountTon <= 0) {
    throw new Error(`Withdrawal #${id} has invalid TON amount.`);
  }

  const destination = Address.parse(String(row.destination));
  const destinationFriendly = destination.toString({ bounceable: false, urlSafe: true });
  const { keyPair, wallet, client, contract } = await getWalletContext();
  const balance = await contract.getBalance();
  const amountNano = toNano(amountTon.toFixed(9));
  const feeReserve = toNano("0.05");
  if (balance < amountNano + feeReserve) {
    throw new Error(`Treasury balance is insufficient. Need at least ${Number(amountNano + feeReserve) / 1e9} TON.`);
  }

  let recipientBalanceBefore = 0n;
  try {
    recipientBalanceBefore = await client.getBalance(destination);
  } catch (_) {
    recipientBalanceBefore = 0n;
  }

  const seqnoBefore = await contract.getSeqno();
  const now = Date.now();
  const locked = await pool.query(
    `UPDATE withdrawals
     SET status='processing', payout_started_at=$1, payout_attempts=COALESCE(payout_attempts,0)+1,
         payout_seqno=$2, payout_error='', updated_at=$1
     WHERE id=$3 AND status='approved'
     RETURNING id`,
    [now, seqnoBefore, id]
  );
  if (!locked.rowCount) return false;

  console.log(`TON payout worker: sending withdrawal #${id}: ${amountTon} TON -> ${destinationFriendly}`);

  try {
    await contract.sendTransfer({
      seqno: seqnoBefore,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: destination,
          value: amountNano,
          bounce: false,
          body: `DzMoney withdrawal #${id}`
        })
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY
    });
  } catch (error) {
    await pool.query(
      `UPDATE withdrawals
       SET status='approved', payout_error=$1, updated_at=$2
       WHERE id=$3 AND status='processing'`,
      [String(error?.message || error).slice(0, 2000), Date.now(), id]
    );
    throw error;
  }

  const confirmation = await waitForConfirmation({
    contract,
    client,
    treasuryAddress: wallet.address,
    destination,
    amountNano,
    seqnoBefore,
    recipientBalanceBefore
  });

  if (!confirmation.confirmed) {
    await pool.query(
      `UPDATE withdrawals
       SET status='processing', payout_error=$1, updated_at=$2
       WHERE id=$3 AND status='processing'`,
      ["Broadcast accepted, but recipient confirmation was not proven. Manual reconciliation required; no automatic resend.", Date.now(), id]
    );
    return true;
  }

  const txHash = confirmation.hash || "";
  await pool.query(
    `UPDATE withdrawals
     SET status='paid', processed_at=$1, payout_tx_hash=$2, payout_error='', updated_at=$1
     WHERE id=$3 AND status='processing'`,
    [Date.now(), txHash, id]
  );

  console.log(`TON payout worker: withdrawal #${id} PAID. tx=${txHash || "hash-pending"}`);
  return true;
}

async function recoverProcessing() {
  // Never automatically resend a processing payout. A broadcast may already
  // have happened before a crash, so automatic retry could double-pay.
  const result = await pool.query(
    `SELECT id,status,payout_error FROM withdrawals WHERE status='processing' ORDER BY id ASC LIMIT 20`
  );
  for (const row of result.rows) {
    if (row.payout_error) {
      console.log(`TON payout worker: withdrawal #${row.id} remains processing: ${row.payout_error}`);
    }
  }
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    await ensureSchema();
    await recoverProcessing();
    const result = await pool.query(
      `SELECT id,amount_ton,destination,status,payout_attempts
       FROM withdrawals
       WHERE status='approved'
       ORDER BY id ASC
       LIMIT 1`
    );
    if (result.rowCount) {
      await processWithdrawal(result.rows[0]);
    }
  } catch (error) {
    console.error("TON payout worker error:", error?.stack || error);
  } finally {
    busy = false;
  }
}

(async () => {
  console.log("TON payout worker: ENABLED, TESTNET ONLY");
  await ensureSchema();
  await poll();
  setInterval(poll, POLL_MS);
})();

module.exports = { poll };
