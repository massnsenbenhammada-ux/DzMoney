"use strict";

/**
 * Safe orchestration layer for TON deposits.
 *
 * This service deliberately does not expose an HTTP route and does not
 * trust client-supplied TON amounts. The caller supplies a transaction id;
 * the adapter reads the transaction from the configured TON network, the
 * verifier checks the normalized result, and only then is DZX credited.
 */

const { verifyTonDepositCandidate } = require("./ton-deposit-verifier");
const { creditVerifiedTonDeposit } = require("./dzx-deposit");

function requireAdapter(adapter) {
  if (!adapter || typeof adapter.findTransaction !== "function") {
    throw new Error("A trusted TON adapter is required.");
  }
}

async function processTonDeposit(client, adapter, {
  userId,
  txId,
  network,
  rules = {},
  metadata = {}
}) {
  requireAdapter(adapter);
  if (!client || typeof client.query !== "function") throw new Error("PostgreSQL client is required.");
  if (!userId) throw new Error("userId is required.");
  if (!txId || String(txId).length > 256) throw new Error("Invalid transaction id.");

  const configuredNetwork = String(rules.network || network || "").toLowerCase();
  if (configuredNetwork !== "mainnet" && configuredNetwork !== "testnet") {
    throw new Error("A valid TON network must be configured.");
  }

  // Check the ledger/deposit table before performing an external request.
  // This reduces unnecessary RPC/indexer calls on repeated submissions.
  const idempotencyKey = `${configuredNetwork}:${String(txId)}`;
  const existing = await client.query(
    `SELECT id, user_id, dzx_amount, status
     FROM economy_deposits
     WHERE idempotency_key=$1
     LIMIT 1`,
    [idempotencyKey]
  );

  if (existing.rowCount) {
    return { credited: false, duplicate: true, deposit: existing.rows[0] };
  }

  const candidate = await adapter.findTransaction({
    txId: String(txId),
    network: configuredNetwork
  });

  if (!candidate) throw new Error("TON transaction was not found.");

  const verified = verifyTonDepositCandidate(candidate, {
    ...rules,
    network: configuredNetwork
  });

  return creditVerifiedTonDeposit(client, {
    userId,
    externalTxId: verified.txId,
    tonAmount: verified.amountTon,
    network: verified.network,
    metadata: {
      ...metadata,
      sender: verified.sender,
      recipient: verified.recipient,
      confirmations: verified.confirmations,
      timestamp: verified.timestamp
    }
  });
}

module.exports = { processTonDeposit };
