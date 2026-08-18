// Universal TON Testnet payout worker
// Detects the deployed standard wallet contract from its on-chain code hash/data,
// derives candidate signing keys from the configured mnemonic, verifies the exact
// treasury address, and only then signs a payout. Unknown/unsupported contracts fail closed.

const { Pool } = require("pg");
const {
  Address, Cell, TonClient, SendMode, internal, toNano,
  WalletContractV1R1, WalletContractV1R2, WalletContractV1R3,
  WalletContractV2R1, WalletContractV2R2,
  WalletContractV3R1, WalletContractV3R2, WalletContractV4,
  WalletContractV5R1
} = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");
const nacl = require("tweetnacl");

const DATABASE_URL = process.env.DATABASE_URL;
const NETWORK = String(process.env.TON_PAYOUT_NETWORK || "testnet").toLowerCase();
const MNEMONIC = String(process.env.TON_TREASURY_MNEMONIC || "").trim();
const TREASURY_ADDRESS = String(process.env.TON_TREASURY_ADDRESS || "").trim();
const MNEMONIC_TYPE = String(process.env.TON_TREASURY_MNEMONIC_TYPE || "auto").toLowerCase();
const RPC_ENDPOINT = process.env.TON_RPC_ENDPOINT || "https://testnet.toncenter.com/api/v2/jsonRPC";
const RPC_API_KEY = String(process.env.TONCENTER_API_KEY || "").trim();
const POLL_MS = Math.max(5000, Number(process.env.TON_PAYOUT_POLL_MS || 10000));
const CONFIRM_TIMEOUT_MS = Math.max(30000, Number(process.env.TON_PAYOUT_CONFIRM_TIMEOUT_MS || 120000));

const WALLET_CODES = new Map([
  ["a0cfc2c48aee16a271f2cfc0b7382d81756cecb1017d077faaab3bb602f6868c", { version: "v1r1", kind: "v1" }],
  ["d4902fcc9fad74698fa8e353220a68da0dcf72e32bcb2eb9ee04217c17d3062c", { version: "v1r2", kind: "v1" }],
  ["587cc789eff1c84f46ec3797e45fc809a14ff5ae24f1e0c7a6a99cc9dc9061ff", { version: "v1r3", kind: "v1" }],
  ["5c9a5e68c108e18721a07c42f9956bfb39ad77ec6d624b60c576ec88eee65329", { version: "v2r1", kind: "v2" }],
  ["fe9530d3243853083ef2ef0b4c2908c0abf6fa1c31ea243aacaa5bf8c7d753f1", { version: "v2r2", kind: "v2" }],
  ["b61041a58a7980b946e8fb9e198e3c904d24799ffa36574ea4251c41a566f581", { version: "v3r1", kind: "v3" }],
  ["84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599", { version: "v3r2", kind: "v3" }],
  ["64dd54805522c5be8a9db59cea0105ccf0d08786ca79beb8cb79e880a8d7322d", { version: "v4r1", kind: "v4r1" }],
  ["feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0", { version: "v4r2", kind: "v4" }],
  ["20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f", { version: "v5r1", kind: "v5" }]
]);

console.log("TON payout env check:", JSON.stringify({
  TON_PAYOUT_ENABLED: process.env.TON_PAYOUT_ENABLED ? "PRESENT" : "MISSING",
  TON_PAYOUT_NETWORK: process.env.TON_PAYOUT_NETWORK ? "PRESENT" : "MISSING",
  TON_TREASURY_MNEMONIC: MNEMONIC ? "PRESENT" : "MISSING",
  TON_TREASURY_ADDRESS: TREASURY_ADDRESS ? "PRESENT" : "MISSING",
  TON_TREASURY_MNEMONIC_TYPE: MNEMONIC_TYPE
}));

const ENABLED = String(process.env.TON_PAYOUT_ENABLED || (MNEMONIC ? "true" : "false")).toLowerCase() === "true";
console.log("TON payout worker boot:", JSON.stringify({
  enabled: ENABLED, network: NETWORK, database: Boolean(DATABASE_URL), mnemonic: Boolean(MNEMONIC),
  treasuryAddress: Boolean(TREASURY_ADDRESS), mnemonicType: MNEMONIC_TYPE, rpc: RPC_ENDPOINT, pollMs: POLL_MS
}));

if (NETWORK !== "testnet") {
  console.error("TON payout worker: REFUSING TO START. TESTNET ONLY.");
  module.exports = {};
} else if (!ENABLED || !DATABASE_URL || !MNEMONIC || !TREASURY_ADDRESS) {
  console.error("TON payout worker: required configuration missing; refusing to process payouts.");
  module.exports = {};
} else if (!["auto", "ton", "multichain"].includes(MNEMONIC_TYPE)) {
  console.error("TON payout worker: TON_TREASURY_MNEMONIC_TYPE must be auto, ton, or multichain.");
  module.exports = {};
} else {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
  let contextPromise = null;
  let busy = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const treasury = () => Address.parse(TREASURY_ADDRESS);

  async function deriveMultichain(words) {
    const bip39 = await import("@scure/bip39");
    const englishModule = await import("@scure/bip39/wordlists/english.js");
    const slip10Module = await import("micro-key-producer/slip10.js");
    const english = englishModule.wordlist || englishModule.default;
    const phrase = words.join(" ");
    if (!bip39.validateMnemonic(phrase, english)) throw new Error("Invalid BIP39 mnemonic");
    const seed = bip39.mnemonicToSeedSync(phrase);
    const slip10 = slip10Module.default || slip10Module;
    const node = slip10.fromMasterSeed(seed).derive("m/44'/607'/0'");
    const kp = nacl.sign.keyPair.fromSeed(Buffer.from(node.privateKey));
    return { publicKey: Buffer.from(kp.publicKey), secretKey: Buffer.from(kp.secretKey), scheme: "multichain", path: "m/44'/607'/0'" };
  }

  async function deriveCandidates() {
    const words = MNEMONIC.split(/\s+/).filter(Boolean);
    const out = [];
    const addTon = async () => {
      const kp = await mnemonicToPrivateKey(words);
      out.push({ publicKey: Buffer.from(kp.publicKey), secretKey: Buffer.from(kp.secretKey), scheme: "ton" });
    };
    const addMulti = async () => out.push(await deriveMultichain(words));

    if (MNEMONIC_TYPE === "ton") await addTon();
    else if (MNEMONIC_TYPE === "multichain") await addMulti();
    else {
      try { await addTon(); } catch (_) {}
      if (words.length === 12 || words.length === 24) { try { await addMulti(); } catch (_) {} }
    }
    const unique = [];
    for (const c of out) if (!unique.some(x => Buffer.compare(x.publicKey, c.publicKey) === 0)) unique.push(c);
    if (!unique.length) throw new Error(`Unable to derive a supported key from the configured ${words.length}-word mnemonic.`);
    return unique;
  }

  function parseOnChainData(state, address, codeHash) {
    if (!state.code || !state.data) throw new Error(`Treasury ${address.toString({ testOnly: true, bounceable: false, urlSafe: true })} has no active wallet code/data.`);
    const code = Cell.fromBoc(Buffer.from(state.code, "base64"))[0];
    const data = Cell.fromBoc(Buffer.from(state.data, "base64"))[0];
    const actualHash = code.hash().toString("hex");
    if (actualHash !== codeHash) throw new Error("RPC returned inconsistent wallet code state.");
    const slice = data.beginParse();
    const meta = WALLET_CODES.get(actualHash);
    let seqno = null, walletId = null, publicKey;
    if (meta.kind === "v1" || meta.kind === "v2") {
      seqno = slice.loadUint(32);
      publicKey = slice.loadBuffer(32);
    } else if (meta.kind === "v3" || meta.kind === "v4" || meta.kind === "v4r1") {
      seqno = slice.loadUint(32);
      walletId = slice.loadUint(32);
      publicKey = slice.loadBuffer(32);
    } else if (meta.kind === "v5") {
      slice.loadUint(1);
      seqno = slice.loadUint(32);
      walletId = slice.loadUint(32);
      publicKey = slice.loadBuffer(32);
    } else throw new Error(`Unsupported wallet kind ${meta.kind}`);
    return { ...meta, codeHash: actualHash, seqno, walletId, publicKey };
  }

  function v5WalletIdObject(walletId, workchain) {
    const unsigned = walletId >>> 0;
    const context = (unsigned ^ ((-3) >>> 0)) >>> 0;
    if ((context >>> 31) !== 1) throw new Error("V5 treasury uses a custom wallet context; automatic signer construction is disabled for safety.");
    const wc = (context >> 23) & 0xff;
    const walletVersion = (context >> 15) & 0xff;
    const subwalletNumber = context & 0x7fff;
    const signedWc = wc & 0x80 ? wc - 256 : wc;
    if (signedWc !== workchain || walletVersion !== 0) throw new Error(`Unsupported V5 wallet context: workchain=${signedWc}, version=${walletVersion}, expected workchain=${workchain}, version=0.`);
    return { networkGlobalId: -3, workchain, walletVersion, subwalletNumber };
  }

  function buildWallet(meta, publicKey, address, walletId) {
    const workchain = address.workChain;
    switch (meta.kind) {
      case "v1":
        if (meta.version === "v1r1") return WalletContractV1R1.create({ workchain, publicKey });
        if (meta.version === "v1r2") return WalletContractV1R2.create({ workchain, publicKey });
        return WalletContractV1R3.create({ workchain, publicKey });
      case "v2":
        if (meta.version === "v2r1") return WalletContractV2R1.create({ workchain, publicKey });
        return WalletContractV2R2.create({ workchain, publicKey });
      case "v3":
        if (meta.version === "v3r1") return WalletContractV3R1.create({ workchain, publicKey, walletId });
        return WalletContractV3R2.create({ workchain, publicKey, walletId });
      case "v4":
        return WalletContractV4.create({ workchain, publicKey, walletId });
      case "v5":
        return WalletContractV5R1.create({ workchain, publicKey, walletId: v5WalletIdObject(walletId, workchain) });
      default:
        throw new Error(`Wallet ${meta.version} is detected but not safely supported by the installed SDK.`);
    }
  }

  async function getWalletContext() {
    if (!contextPromise) contextPromise = (async () => {
      const address = treasury();
      const client = new TonClient({ endpoint: RPC_ENDPOINT, apiKey: RPC_API_KEY || undefined });
      const balance = await client.getBalance(address);
      const state = await client.getContractState(address);
      if (!state.code) throw new Error("Treasury is not an active contract; refusing payout.");
      const code = Cell.fromBoc(Buffer.from(state.code, "base64"))[0];
      const codeHash = code.hash().toString("hex");
      const meta = WALLET_CODES.get(codeHash);
      if (!meta) throw new Error(`Unsupported treasury wallet code hash ${codeHash}. Refusing to send.`);
      if (meta.kind === "v4r1") throw new Error("Detected Wallet V4R1. The installed @ton/ton SDK exposes V4R2 only; refusing to guess V4R1 serialization.");
      const identity = parseOnChainData(state, address, codeHash);
      console.log(`TON payout worker: detected TESTNET wallet ${identity.version} code_hash=${codeHash} balance=${Number(balance) / 1e9} TON seqno=${identity.seqno}`);
      const candidates = await deriveCandidates();
      const matches = [];
      for (const candidate of candidates) {
        const wallet = buildWallet(identity, candidate.publicKey, address, identity.walletId);
        if (wallet.address.equals(address) && Buffer.compare(candidate.publicKey, identity.publicKey) === 0) matches.push({ candidate, wallet });
      }
      if (matches.length !== 1) throw new Error(`Treasury signer verification failed for ${identity.version}. On-chain public key does not match a unique configured mnemonic candidate. Refusing to send.`);
      const match = matches[0];
      console.log(`TON payout worker: signer verified on-chain (${identity.version}, ${match.candidate.scheme}${match.candidate.path ? ` ${match.candidate.path}` : ""})`);
      return { client, treasuryAddress: address, wallet: match.wallet, keyPair: match.candidate, identity };
    })().catch(error => { contextPromise = null; throw error; });
    return contextPromise;
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

  async function findRecentTransactionHash(client, address, seqno) {
    try {
      const txs = await client.getTransactions(address, { limit: 20 });
      return txs.find(tx => tx.description && Number(tx.description.seqno) === Number(seqno))?.hash().toString("hex") || (txs[0] ? txs[0].hash().toString("hex") : "");
    } catch (_) { return ""; }
  }

  async function waitForConfirmation(ctx, destination, amountNano, seqnoBefore, recipientBefore) {
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    const contract = ctx.client.open(ctx.wallet);
    while (Date.now() < deadline) {
      const seq = await ctx.wallet.getSeqno(contract);
      let recipientNow = null;
      try { recipientNow = await ctx.client.getBalance(destination); } catch (_) {}
      if (seq !== seqnoBefore) {
        const delta = recipientNow === null ? null : recipientNow - recipientBefore;
        if (delta === null || delta >= amountNano) return { confirmed: true, hash: await findRecentTransactionHash(ctx.client, ctx.treasuryAddress, seqnoBefore) };
        return { confirmed: false, hash: await findRecentTransactionHash(ctx.client, ctx.treasuryAddress, seqnoBefore) };
      }
      await sleep(1500);
    }
    return { confirmed: false, hash: "" };
  }

  async function sendWithDetectedWallet(ctx, seqno, destination, amountNano, id) {
    const msg = internal({ to: destination, value: amountNano, bounce: false, body: `DzMoney TESTNET withdrawal #${id}` });
    const contract = ctx.client.open(ctx.wallet);
    const common = { seqno, secretKey: ctx.keyPair.secretKey, sendMode: SendMode.PAY_GAS_SEPARATELY };
    if (ctx.identity.kind === "v5") {
      await contract.sendTransfer({ ...common, actions: [{ type: "sendMsg", mode: SendMode.PAY_GAS_SEPARATELY, outMsg: msg }] });
    } else if (ctx.identity.kind === "v1") {
      await contract.sendTransfer({ ...common, message: msg });
    } else {
      await contract.sendTransfer({ ...common, messages: [msg] });
    }
  }

  async function processWithdrawal(row) {
    const id = Number(row.id);
    const amountTon = Number(row.amount_ton);
    if (!Number.isFinite(amountTon) || amountTon <= 0) throw new Error(`Withdrawal #${id} has invalid TON amount.`);
    const destination = Address.parse(String(row.destination));
    const ctx = await getWalletContext();
    const balance = await ctx.client.getBalance(ctx.treasuryAddress);
    const amountNano = toNano(amountTon.toFixed(9));
    const reserve = toNano("0.05");
    if (balance < amountNano + reserve) throw new Error(`Treasury balance is insufficient. Need at least ${Number(amountNano + reserve) / 1e9} TON.`);
    const recipientBefore = await ctx.client.getBalance(destination).catch(() => 0n);
    const contract = ctx.client.open(ctx.wallet);
    const seqno = await ctx.wallet.getSeqno(contract);
    const locked = await pool.query(`UPDATE withdrawals SET status='processing', payout_started_at=$1, payout_attempts=COALESCE(payout_attempts,0)+1, payout_seqno=$2, payout_error='', payout_network='testnet', updated_at=$1 WHERE id=$3 AND status='approved' RETURNING id`, [Date.now(), seqno, id]);
    if (!locked.rowCount) return false;
    console.log(`TON payout worker: sending TESTNET withdrawal #${id} using ${ctx.identity.version}: ${amountTon} TON -> ${destination.toString({ bounceable: false, urlSafe: true })}`);
    try {
      await sendWithDetectedWallet(ctx, seqno, destination, amountNano, id);
      console.log(`TON payout worker: broadcast accepted for #${id}, seqno=${seqno}`);
    } catch (error) {
      await pool.query(`UPDATE withdrawals SET status='approved', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, [String(error?.message || error).slice(0, 2000), Date.now(), id]);
      throw error;
    }
    const confirmation = await waitForConfirmation(ctx, destination, amountNano, seqno, recipientBefore);
    if (!confirmation.confirmed) {
      await pool.query(`UPDATE withdrawals SET status='processing', payout_error=$1, updated_at=$2 WHERE id=$3 AND status='processing'`, ["Broadcast accepted, but recipient confirmation was not proven. Manual reconciliation required; no automatic resend.", Date.now(), id]);
      console.error(`TON payout worker: #${id} requires reconciliation; NO automatic resend.`);
      return true;
    }
    await pool.query(`UPDATE withdrawals SET status='paid', processed_at=$1, payout_tx_hash=$2, payout_error='', updated_at=$1 WHERE id=$3 AND status='processing'`, [Date.now(), confirmation.hash || "", id]);
    console.log(`TON payout worker: TESTNET withdrawal #${id} PAID. tx=${confirmation.hash || "unknown"}`);
    return true;
  }

  async function recoverProcessing() {
    const result = await pool.query(`SELECT id,payout_error FROM withdrawals WHERE status='processing' ORDER BY id ASC LIMIT 20`);
    for (const row of result.rows) console.log(`TON payout worker: withdrawal #${row.id} remains processing; no automatic resend. ${row.payout_error || ""}`);
  }

  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const result = await pool.query(`SELECT * FROM withdrawals WHERE status='approved' AND LOWER(COALESCE(payout_network,''))='testnet' ORDER BY id ASC LIMIT 5`);
      for (const row of result.rows) {
        console.log(`TON payout worker: found approved TESTNET withdrawal #${row.id}`);
        try { await processWithdrawal(row); } catch (error) { console.error("TON payout worker error:", error); }
      }
    } finally { busy = false; }
  }

  (async () => {
    try {
      await ensureSchema();
      await recoverProcessing();
      setInterval(poll, POLL_MS);
      await poll();
    } catch (error) {
      console.error("TON payout worker startup error:", error);
    }
  })();
}
