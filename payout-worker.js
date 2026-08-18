const { Pool } = require("pg");
const { Address, TonClient, WalletContractV5R1, SendMode, internal, toNano } = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");

const DATABASE_URL = process.env.DATABASE_URL;
const NETWORK = String(process.env.TON_PAYOUT_NETWORK || "testnet").toLowerCase();
const MNEMONIC = String(process.env.TON_TREASURY_MNEMONIC || "").trim();
const TREASURY_ADDRESS = String(process.env.TON_TREASURY_ADDRESS || "").trim();
const RPC_ENDPOINT = process.env.TON_RPC_ENDPOINT || "https://testnet.toncenter.com/api/v2/jsonRPC";
const RPC_API_KEY = String(process.env.TONCENTER_API_KEY || "").trim();
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));
const CONFIRM_TIMEOUT_MS = Math.max(30000, Number(process.env.TON_PAYOUT_CONFIRM_TIMEOUT_MS || 120000));

console.log("TON payout env check:", JSON.stringify({
  TON_PAYOUT_ENABLED: process.env.TON_PAYOUT_ENABLED ? "PRESENT" : "MISSING",
  TON_PAYOUT_NETWORK: process.env.TON_PAYOUT_NETWORK ? "PRESENT" : "MISSING",
  TON_TREASURY_MNEMONIC: process.env.TON_TREASURY_MNEMONIC ? "PRESENT" : "MISSING",
  TON_TREASURY_ADDRESS: TREASURY_ADDRESS ? "PRESENT" : "MISSING"
}));

const ENABLED = String(process.env.TON_PAYOUT_ENABLED || (MNEMONIC ? "true" : "false")).toLowerCase() === "true";

console.log("TON payout worker boot:", JSON.stringify({
  enabled: ENABLED,
  network: NETWORK,
  database: Boolean(DATABASE_URL),
  mnemonic: Boolean(MNEMONIC),
  treasuryAddress: Boolean(TREASURY_ADDRESS),
  rpc: RPC_ENDPOINT,
  pollMs: POLL_MS
}));

if (NETWORK !== "testnet") {
  console.error("TON payout worker: REFUSING TO START. This worker is TESTNET-ONLY. Set TON_PAYOUT_NETWORK=testnet.");
  module.exports = {};
} else if (!ENABLED) {
  console.log("TON payout worker: disabled. Set TON_PAYOUT_ENABLED=true or provide the testnet treasury mnemonic.");
  module.exports = {};
} else if (!DATABASE_URL) {
  console.error("TON payout worker: DATABASE_URL is missing; will keep retrying configuration checks.");
  module.exports = {};
} else if (!MNEMONIC) {
  console.error("TON payout worker: TON_TREASURY_MNEMONIC is missing; will keep retrying configuration checks.");
  module.exports = {};
} else if (!TREASURY_ADDRESS) {
  console.error("TON payout worker: TON_TREASURY_ADDRESS is missing; refusing to process payouts.");
  module.exports = {};
} else {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  let walletContextPromise = null;
  let busy = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function treasuryAddressObject() {
    return Address.parse(TREASURY_ADDRESS);
  }

  async function getWalletContext() {
    if (!walletContextPromise) {
      walletContextPromise = (async () => {
        const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(/\s+/));
        const treasuryAddress = treasuryAddressObject();

        // The configured address is authoritative for treasury balance checks.
        // The mnemonic is used only to sign the outgoing transfer.
        const walletId = 0x7FFFFF11;
        const wallet = WalletContractV5R1.create({
          walletId,
          publicKey: keyPair.publicKey,
          workchain: treasuryAddress.workChain
        });

        const client = new TonClient({ endpoint: RPC_ENDPOINT, apiKey: RPC_API_KEY || undefined });
        const configuredBalance = await client.getBalance(treasuryAddress);
        const derivedAddress = wallet.address;

        console.log(
          "TON payout worker: configured TESTNET treasury",
          treasuryAddress.toString({ testOnly: true, bounceable: false, urlSafe: true }),
          "balance",
          Number(configuredBalance) / 1e9,
          "TON"
        );

        if (!derivedAddress.equals(treasuryAddress)) {
          console.error(
            "TON payout worker: WARNING - mnemonic-derived signing wallet does not equal configured treasury address.",
            "configured=",
            treasuryAddress.toString({ testOnly: true, bounceable: false, urlSafe: true }),
            "derived=",
            derivedAddress.toString({ testOnly: true, bounceable: false, urlSafe: true })
          );
        }

        return { keyPair, wallet, client, treasuryAddress };
      })().catch(error => {
        walletContextPromise = null;
        throw error;
      });
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
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_network TEXT;
    `);
  }

  async function findRecentTransactionHash(client, address, beforeSeqno) {
    try {
      const txs = await client.getTransactions(address, { limit: 10 });
      for (const tx of txs) {
        const txHash = tx.hash().toString("hex");
        const desc = tx.description;
        if (desc && typeof desc === "object" && Number(desc.seqno) === Number(beforeSeqno)) return txHash;
      }
      return txs.length ? txs[0].hash().toString("hex") : "";
    } catch (error) {
      console.error("TON transaction lookup failed:", error.message);
      return "";
    }
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
    if (!Number.isFinite(amountTon) || amountTon <= 0) throw new Error(`Withdrawal #${id} has invalid TON amount.`);

    const destination = Address.parse(String(row.destination));
    const { keyPair, wallet, client, treasuryAddress } = await getWalletContext();
    const balance = await client.getBalance(treasuryAddress);
    const amountNano = toNano(amountTon.toFixed(9));
    const feeReserve = toNano("0.05");
    if (balance < amountNano + feeReserve) throw new Error(`Treasury balance is insufficient. Need at least ${Number(amountNano + feeReserve) / 1e9} TON.`);

    const derivedAddress = wallet.address;
    if (!derivedAddress.equals(treasuryAddress)) {
      throw new Error(
        `Treasury signer mismatch. Configured ${treasuryAddress.toString({ testOnly: true, bounceable: false, urlSafe: true })} but mnemonic derives ${derivedAddress.toString({ testOnly: true, bounceable: false, urlSafe: true })}. Refusing to send.`
      );
    }

    let recipientBalanceBefore = 0n;
    try { recipientBalanceBefore = await client.getBalance(destination); } catch (_) {}

    const seqnoBefore = await client.runMethod(treasuryAddress, "seqno").then(r => Number(r.stack.readNumber()));
    const contract = client.open(wallet);
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

    console.log(`TON payout worker: sending TESTNET withdrawal #${id}: ${amountTon} TON -> ${destination.toString({ bounceable: false, urlSafe: true })}`);

    try {
      await contract.sendTransfer({
        seqno: seqnoBefore,
        secretKey: keyPair.secretKey,
        messages: [internal({ to: destination, value: amountNano, bounce: false, body: `DzMoney TESTNET withdrawal #${id}` })],
        sendMode: SendMode.PAY_GAS_SEPARATELY
      });
      console.log(`TON payout worker: broadcast accepted for TESTNET withdrawal #${id}, seqno=${seqnoBefore}`);
    } catch (error) {
      await pool.query(`UPDATE withdrawals SET status='approved', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, [String(error?.message || error).slice(0, 2000), Date.now(), id]);
      throw error;
    }

    const confirmation = await waitForConfirmation({ contract, client, treasuryAddress, destination, amountNano, seqnoBefore, recipientBalanceBefore });
    if (!confirmation.confirmed) {
      await pool.query(`UPDATE withdrawals SET status='processing', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, ["Broadcast accepted, but recipient confirmation was not proven. Manual reconciliation required; no automatic resend.", Date.now(), id]);
      console.error(`TON payout worker: TESTNET withdrawal #${id} needs reconciliation; NO automatic resend.`);
      return true;
    }

    const txHash = confirmation.hash || "";
    await pool.query(`UPDATE withdrawals SET status='paid', processed_at=$1, payout_tx_hash=$2, payout_error='', updated_at=$1 WHERE id=$3 AND status='processing'`, [Date.now(), txHash, id]);
    console.log(`TON payout worker: TESTNET withdrawal #${id} PAID. tx=${txHash || "hash-pending"}`);
    return true;
  }

  async function recoverProcessing() {
    const result = await pool.query(`SELECT id,status,payout_error FROM withdrawals WHERE status='processing' ORDER BY id ASC LIMIT 20`);
    for (const row of result.rows) {
      console.log(`TON payout worker: withdrawal #${row.id} remains processing; no automatic resend. ${row.payout_error || ""}`);
    }
  }

  async function poll() {
    if (busy) return;
    busy = true;
    try {
      await ensureSchema();

      const approved = await pool.query(`
        SELECT id, amount_ton, destination, status, payout_attempts, payout_network
        FROM withdrawals
        WHERE status='approved'
          AND (
            LOWER(COALESCE(payout_network, '')) = 'testnet'
            OR (COALESCE(TRIM(payout_network), '') = '' AND LOWER(TRIM(destination)) LIKE '0q%')
            OR (COALESCE(TRIM(payout_network), '') = '' AND LOWER(TRIM(destination)) LIKE 'k%')
          )
        ORDER BY id ASC
        LIMIT 1
      `);

      if (approved.rowCount) {
        console.log(`TON payout worker: found approved TESTNET withdrawal #${approved.rows[0].id}`);
        await processWithdrawal(approved.rows[0]);
      } else {
        console.log("TON payout worker: heartbeat - no approved TESTNET withdrawals");
      }
      await recoverProcessing();
    } catch (error) {
      console.error("TON payout worker error:", error?.stack || error);
    } finally {
      busy = false;
    }
  }

  (async () => {
    console.log("TON payout worker: ENABLED, TESTNET ONLY; explicit treasury address mode");
    await poll();
    setInterval(poll, POLL_MS);
  })().catch(error => console.error("TON payout worker fatal startup error:", error?.stack || error));

  module.exports = { poll };
}
