const { withTransaction } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const { startAdvertisementEvent, markAdvertisementVerified } = require('./ad-event-service');

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function startTaskVerificationAd({ attemptId, idempotencyKey, externalAdId = null }) {
  requiredId(attemptId, 'attemptId');
  requiredId(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const gateResult = await client.query(
      `SELECT g.*,a.user_id,a.status AS attempt_status
       FROM task_verification_gates g JOIN task_attempts a ON a.id=g.attempt_id
       WHERE g.attempt_id=$1 FOR UPDATE`,
      [attemptId]
    );
    if (!gateResult.rowCount) throw new Error('Verification gate not found');
    const gate = gateResult.rows[0];
    if (gate.attempt_status !== 'verification_pending') throw new Error('Task attempt is not awaiting verification');

    const existing = await client.query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1 FOR SHARE', [idempotencyKey]);
    if (existing.rowCount) return { gate, adEvent: existing.rows[0], duplicate: true };

    const adEvent = await client.query(
      `INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,metadata)
       VALUES($1,'verification',$2,$3,$4) RETURNING *`,
      [gate.user_id, externalAdId, idempotencyKey, { attempt_id: attemptId, required_seconds: gate.required_seconds }]
    );
    await client.query(
      `UPDATE task_verification_gates SET ad_event_id=$1,metadata=metadata||$2::jsonb WHERE id=$3`,
      [adEvent.rows[0].id, JSON.stringify({ verification_ad_id: adEvent.rows[0].id }), gate.id]
    );
    return { gate: { ...gate, ad_event_id: adEvent.rows[0].id }, adEvent: adEvent.rows[0], duplicate: false };
  });
}

async function verifyTaskAdvertisement({ adEventId, providerReference, verificationMetadata = {} }) {
  const result = await markAdvertisementVerified({ adEventId, providerReference, verificationMetadata });
  if (result.duplicate) return result;
  await withTransaction(async client => {
    await client.query(
      `UPDATE task_verification_gates SET status='ad_completed',ad_completed_at=NOW()
       WHERE ad_event_id=$1 AND status='pending'`,
      [adEventId]
    );
  });
  return result;
}

async function finalizeTaskVerification({ attemptId, idempotencyKey }) {
  requiredId(attemptId, 'attemptId');
  requiredId(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const result = await client.query(
      `SELECT a.*,t.reward_coin,t.reward_dzx,t.reward_dzp,t.id AS task_id,
              g.id AS gate_id,g.status AS gate_status
       FROM task_attempts a
       JOIN activity_tasks t ON t.id=a.task_id
       JOIN task_verification_gates g ON g.attempt_id=a.id
       WHERE a.id=$1 FOR UPDATE`,
      [attemptId]
    );
    if (!result.rowCount) throw new Error('Task attempt not found');
    const row = result.rows[0];
    if (row.status === 'verified') return { duplicate: true, status: 'verified' };
    if (row.status !== 'verification_pending') throw new Error('Task attempt is not pending verification');
    if (row.gate_status !== 'ad_completed') throw new Error('Verification advertisement must be verified first');

    const reward = await creditActivityRewardOnClient(client, {
      idempotencyKey,
      userId: row.user_id,
      source: 'task',
      coin: Number(row.reward_coin),
      dzx: Number(row.reward_dzx),
      dzp: Number(row.reward_dzp),
      modifiers: []
    });

    await client.query(`UPDATE task_attempts SET status='verified',verify_idempotency_key=$1,verified_at=NOW() WHERE id=$2`, [idempotencyKey, attemptId]);
    await client.query(`UPDATE task_verification_gates SET status='verified',verified_at=NOW() WHERE id=$1`, [row.gate_id]);
    return { duplicate: false, status: 'verified', rewarded: true, reward };
  });
}

module.exports = { startTaskVerificationAd, verifyTaskAdvertisement, finalizeTaskVerification };
