const { randomUUID } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { selectNextProvider } = require('./ad-provider-service');

const AD_CONTEXTS = ['task', 'gaming', 'daily_checkin', 'verification', 'squad'];

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

/** Start an idempotent advertisement event in an explicit context. */
async function startAdvertisementEvent({ userId, context, idempotencyKey, externalAdId = null, metadata = {} }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!AD_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');
  const result = await query(
    `INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,metadata)
     VALUES($1,$2,$3,$4,NOW(),$5)
     ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,
    [userId, context, externalAdId, idempotencyKey, metadata]
  );
  if (result.rowCount) return { adEvent: result.rows[0], duplicate: false };
  const existing = await query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1', [idempotencyKey]);
  return { adEvent: existing.rows[0], duplicate: true };
}

/** Start a rotated advertisement event while serializing provider allocation per context. */
async function startRotatedAdvertisementEventOnClient(client, { userId, context, idempotencyKey, externalAdId = null, metadata = {}, providerRegistry }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!AD_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');
  if (!providerRegistry) throw new Error('Advertisement provider registry is required');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dzmoney:ad-provider-rotation:${context}`]);
  const existing = await client.query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1 FOR SHARE', [idempotencyKey]);
  if (existing.rowCount) return { adEvent: existing.rows[0], providerId: existing.rows[0].metadata?.provider_id, duplicate: true };
  const previous = await client.query(
    `SELECT metadata->>'provider_id' AS provider_id
     FROM activity_ad_events
     WHERE user_id=$1 AND context=$2 AND metadata->>'provider_id' IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [userId, context]
  );
  const provider = selectNextProvider(providerRegistry, { context, previousProviderId: previous.rows[0]?.provider_id || null });
  const event = await client.query(
    `INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,metadata)
     VALUES($1,$2,$3,$4,NOW(),$5) RETURNING *`,
    [userId, context, externalAdId || randomUUID(), idempotencyKey, { ...metadata, provider_id: provider.id }]
  );
  return { adEvent: event.rows[0], providerId: provider.id, duplicate: false };
}

/** Mark a supported advertisement event as provider-verified exactly once. */
async function markAdvertisementVerified({ adEventId, providerReference, verificationMetadata = {} }) {
  requiredId(adEventId, 'adEventId');
  requiredId(providerReference, 'providerReference');
  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM activity_ad_events WHERE id=$1 FOR UPDATE`, [adEventId]);
    if (!result.rowCount) throw new Error('Advertisement event not found');
    const event = result.rows[0];
    if (event.verified) return { adEvent: event, duplicate: true };
    const updated = await client.query(
      `UPDATE activity_ad_events SET completed_at=COALESCE(completed_at,NOW()), verified=TRUE,
       metadata=metadata || $2::jsonb WHERE id=$1 RETURNING *`,
      [adEventId, JSON.stringify({ provider_reference: providerReference, provider_verification: verificationMetadata })]
    );
    return { adEvent: updated.rows[0], duplicate: false };
  });
}

module.exports = { AD_CONTEXTS, startAdvertisementEvent, startRotatedAdvertisementEventOnClient, markAdvertisementVerified };
