"use strict";

/**
 * Safe DZX deposit crediting primitive.
 *
 * This module does NOT discover blockchain transactions. A trusted TON
 * verification layer must call creditVerifiedTonDeposit() only after it has
 * independently verified the transaction on the configured network.
 *
 * The operation is idempotent by external transaction id, so the same TON
 * deposit cannot credit DZX twice.
 */

const { tonToDzx } = require("./economy");

function normalizeTon(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid TON amount.");
  return n;
}

async function creditVerifiedTonDeposit(client, {
  userId,
  externalTxId,
  tonAmount,
  network = "mainnet",
  metadata = {}
}) {
  if (!client || typeof client.query !== "function") throw new Error("PostgreSQL client is required.");
  if (!userId) throw new Error("userId is required.");
  if (!externalTxId) throw new Error("externalTxId is required.");

  const ton = normalizeTon(tonAmount);
  const dzx = tonToDzx(ton);
  if (!Number.isFinite(dzx) || dzx <= 0) throw new Error("Unable to convert TON to DZX.");

  const idempotencyKey = `${network}:${String(externalTxId)}`;

  await client.query("BEGIN");
  try {
    const existing = await client.query(
      `SELECT id, user_id, dzx_amount, status
       FROM economy_deposits
       WHERE idempotency_key=$1
       FOR UPDATE`,
      [idempotencyKey]
    );

    if (existing.rowCount) {
      await client.query("COMMIT");
      return { credited: false, duplicate: true, deposit: existing.rows[0] };
    }

    const user = await client.query(
      `SELECT id FROM users WHERE id=$1 FOR UPDATE`,
      [String(userId)]
    );
    if (!user.rowCount) throw new Error("User not found.");

    const now = Date.now();
    const deposit = await client.query(
      `INSERT INTO economy_deposits
       (user_id, idempotency_key, external_tx_id, network, ton_amount, dzx_amount, status, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'credited',$7::jsonb,$8)
       RETURNING *`,
      [String(userId), idempotencyKey, String(externalTxId), network, ton.toString(), dzx.toString(), JSON.stringify(metadata || {}), now]
    );

    await client.query(
      `UPDATE users
       SET dzx=dzx+$1,
           deposited_dzx=deposited_dzx+$1
       WHERE id=$2`,
      [dzx, String(userId)]
    );

    await client.query(
      `INSERT INTO economy_ledger
       (user_id, asset, direction, amount, balance_bucket, source_type, source_id, metadata, created_at)
       VALUES ($1,'DZX','CREDIT',$2,'deposited','TON_DEPOSIT',$3,$4::jsonb,$5)`,
      [String(userId), dzx, idempotencyKey, JSON.stringify({ tonAmount: ton.toString(), network, ...metadata }), now]
    );

    await client.query("COMMIT");
    return { credited: true, duplicate: false, deposit: deposit.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

module.exports = { creditVerifiedTonDeposit };
