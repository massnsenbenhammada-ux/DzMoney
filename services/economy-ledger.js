"use strict";

// Server-side ledger primitives. The caller supplies the existing pg client so
// balance changes and ledger entries can share one database transaction.

function decimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid economic amount.");
  return n;
}

async function recordEntry(client, { userId, asset, direction, amount, balanceBucket = "available", sourceType, sourceId = "", metadata = {} }) {
  if (!userId) throw new Error("userId is required.");
  if (!["DZX", "DZP", "COINS"].includes(asset)) throw new Error("Invalid asset.");
  if (!["CREDIT", "DEBIT"].includes(direction)) throw new Error("Invalid ledger direction.");
  const value = decimal(amount);
  if (value <= 0) throw new Error("Ledger amount must be greater than zero.");
  if (!sourceType) throw new Error("sourceType is required.");

  const result = await client.query(
    `INSERT INTO economy_ledger
      (user_id, asset, direction, amount, balance_bucket, source_type, source_id, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, user_id, asset, direction, amount, balance_bucket, source_type, source_id, created_at`,
    [userId, asset, direction, value, balanceBucket, sourceType, sourceId, metadata, Date.now()]
  );
  return result.rows[0];
}

async function creditDZX(client, userId, amount, options = {}) {
  const value = decimal(amount);
  const bucket = options.balanceBucket || "available";
  const column = bucket === "withdrawable" ? "withdrawable_dzx" : bucket === "locked" ? "locked_dzx" : "dzx";
  await client.query(`UPDATE users SET ${column} = ${column} + $1 WHERE id=$2`, [value, userId]);
  await recordEntry(client, { userId, asset: "DZX", direction: "CREDIT", amount: value, balanceBucket: bucket, sourceType: options.sourceType || "SYSTEM", sourceId: options.sourceId || "", metadata: options.metadata || {} });
}

async function debitDZX(client, userId, amount, options = {}) {
  const value = decimal(amount);
  const bucket = options.balanceBucket || "available";
  const column = bucket === "withdrawable" ? "withdrawable_dzx" : bucket === "locked" ? "locked_dzx" : "dzx";
  const result = await client.query(
    `UPDATE users SET ${column} = ${column} - $1 WHERE id=$2 AND ${column} >= $1 RETURNING id`,
    [value, userId]
  );
  if (!result.rowCount) throw new Error("Insufficient DZX balance.");
  await recordEntry(client, { userId, asset: "DZX", direction: "DEBIT", amount: value, balanceBucket: bucket, sourceType: options.sourceType || "SYSTEM", sourceId: options.sourceId || "", metadata: options.metadata || {} });
}

module.exports = { recordEntry, creditDZX, debitDZX };
