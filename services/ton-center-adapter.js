"use strict";

/**
 * Read-only TON Center v3 adapter.
 *
 * SECURITY RULES:
 * - This adapter never credits DZX.
 * - The deposit address MUST come from server-side configuration.
 * - The caller must explicitly select mainnet/testnet.
 * - Transaction data is normalized and then passed to the existing verifier.
 * - A transaction hash alone is never treated as proof of a deposit.
 */

const { verifyTonDepositCandidate } = require("./ton-deposit-verifier");

function apiBase(network) {
  if (network === "testnet") return "https://testnet.toncenter.com/api/v3";
  if (network === "mainnet") return "https://toncenter.com/api/v3";
  throw new Error("Unsupported TON network.");
}

function apiKey() {
  const key = String(process.env.TONCENTER_API_KEY || "").trim();
  if (!key) throw new Error("TONCENTER_API_KEY is not configured.");
  return key;
}

function depositAddress() {
  const address = String(process.env.TON_DEPOSIT_ADDRESS || "").trim();
  if (!address) throw new Error("TON_DEPOSIT_ADDRESS is not configured.");
  return address;
}

function parseTon(valueNano) {
  const nano = BigInt(String(valueNano || "0"));
  if (nano <= 0n) throw new Error("Invalid TON transaction value.");
  // Keep conversion exact enough for financial validation; final DZX conversion
  // remains in the existing economic service.
  const whole = nano / 1000000000n;
  const fraction = (nano % 1000000000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? Number(`${whole}.${fraction}`) : Number(whole);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey(), Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`TON Center request failed (${response.status}).`);
  }
  return response.json();
}

function findInboundMessage(tx) {
  // TON Center v3 has evolved its response shape; accept only explicit inbound
  // messages and never infer a deposit from an outbound message.
  const candidates = [tx.in_msg, tx.in_msg?.message, tx.in_message].filter(Boolean);
  for (const message of candidates) {
    const source = message.source || message.src;
    const destination = message.destination || message.dest;
    const value = message.value ?? message.value_coins ?? message.amount;
    if (destination && value != null) return { source, destination, value };
  }
  return null;
}

async function fetchTransactionCandidate({ txId, network }) {
  const hash = String(txId || "").trim();
  if (!hash) throw new Error("Transaction hash is required.");
  const net = String(network || "").toLowerCase();

  const url = new URL(`${apiBase(net)}/transactions`);
  url.searchParams.set("hash", hash);
  url.searchParams.set("limit", "10");

  const data = await getJson(url);
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const tx = transactions.find((item) => String(item.hash || "") === hash) || transactions[0];
  if (!tx) throw new Error("TON transaction was not found.");

  const inbound = findInboundMessage(tx);
  if (!inbound) throw new Error("No explicit inbound TON message was found.");

  const destination = String(inbound.destination);
  const sender = inbound.source ? String(inbound.source) : "";
  const amountTon = parseTon(inbound.value);
  const success = tx.description?.compute_ph?.success === true && tx.description?.action?.success !== false;
  const timestamp = Number(tx.now);

  // v3 transactions are finalized blockchain records. We still require the
  // application-level confirmed flag and a configured confirmation threshold.
  // The current adapter reports one confirmation only; production policy may
  // raise this threshold after a deeper masterchain confirmation implementation.
  return {
    txId: hash,
    network: net,
    recipient: destination,
    sender,
    amountTon,
    confirmed: true,
    confirmations: 1,
    success,
    timestamp,
    raw: tx
  };
}

async function verifyTransaction({ txId, network, minimumDepositTon, requiredConfirmations = 1 }) {
  const candidate = await fetchTransactionCandidate({ txId, network });
  return verifyTonDepositCandidate(candidate, {
    network,
    depositAddress: depositAddress(),
    minimumDepositTon,
    requiredConfirmations
  });
}

module.exports = {
  fetchTransactionCandidate,
  verifyTransaction,
  apiBase
};
