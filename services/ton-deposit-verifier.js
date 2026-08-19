"use strict";

/**
 * Conservative TON deposit verification gate.
 *
 * This module deliberately does NOT credit DZX by itself. It validates a
 * normalized transaction candidate supplied by a trusted TON indexer/RPC
 * adapter. Only a candidate that passes every rule may be forwarded to
 * services/dzx-deposit.js for transactional crediting.
 *
 * Required normalized candidate shape:
 * {
 *   txId, network, recipient, sender, amountTon, confirmed, confirmations,
 *   success, timestamp
 * }
 */

const { Address } = require("@ton/ton");

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Address is required.");
  return Address.parse(raw).toString({ urlSafe: true, bounceable: false, testOnly: false });
}

function normalizeNetwork(value) {
  const network = String(value || "").trim().toLowerCase();
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error("Unsupported TON network.");
  }
  return network;
}

function verifyTonDepositCandidate(candidate, rules = {}) {
  if (!candidate || typeof candidate !== "object") throw new Error("Transaction candidate is required.");

  const network = normalizeNetwork(candidate.network);
  const txId = String(candidate.txId || "").trim();
  if (!txId || txId.length > 256) throw new Error("Invalid transaction id.");

  const expectedNetwork = normalizeNetwork(rules.network || network);
  if (network !== expectedNetwork) throw new Error("Transaction network does not match the configured network.");

  const recipient = normalizeAddress(candidate.recipient);
  const expectedRecipient = normalizeAddress(rules.depositAddress);
  if (recipient !== expectedRecipient) throw new Error("Transaction recipient does not match the DzMoney deposit address.");

  if (candidate.sender) normalizeAddress(candidate.sender);

  const amountTon = Number(candidate.amountTon);
  if (!Number.isFinite(amountTon) || amountTon <= 0) throw new Error("Invalid TON amount.");

  const minimumTon = Number(rules.minimumDepositTon ?? 1);
  if (!Number.isFinite(minimumTon) || minimumTon <= 0) throw new Error("Invalid minimum deposit configuration.");
  if (amountTon < minimumTon) throw new Error(`Deposit is below the minimum of ${minimumTon} TON.`);

  if (candidate.success !== true) throw new Error("Transaction is not successful.");
  if (candidate.confirmed !== true) throw new Error("Transaction is not confirmed.");

  const confirmations = Number(candidate.confirmations ?? 0);
  const requiredConfirmations = Math.max(1, Number(rules.requiredConfirmations ?? 1));
  if (!Number.isSafeInteger(confirmations) || confirmations < requiredConfirmations) {
    throw new Error("Transaction does not have enough confirmations.");
  }

  const timestamp = Number(candidate.timestamp || 0);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Invalid transaction timestamp.");

  const maxAgeSeconds = Math.max(0, Number(rules.maxAgeSeconds ?? 86400));
  const now = Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && timestamp < now - maxAgeSeconds) {
    throw new Error("Transaction is outside the deposit processing window.");
  }
  if (timestamp > now + 300) throw new Error("Transaction timestamp is in the future.");

  return {
    txId,
    network,
    recipient,
    sender: candidate.sender ? normalizeAddress(candidate.sender) : "",
    amountTon,
    confirmations,
    timestamp,
    verified: true
  };
}

module.exports = { verifyTonDepositCandidate, normalizeAddress, normalizeNetwork };
