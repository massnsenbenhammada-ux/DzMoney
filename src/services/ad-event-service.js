const { query } = require('../db/pool');

const AD_CONTEXTS = ['task', 'reward_pool', 'daily_checkin', 'verification'];

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function recordAdvertisementCompletion({ userId, context, idempotencyKey, externalAdId = null, metadata = {} }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!AD_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');

  const result = await query(
    `INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,completed_at,verified,metadata)
     VALUES($1,$2,$3,$4,NOW(),NOW(),TRUE,$5)
     ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,
    [userId, context, externalAdId, idempotencyKey, metadata]
  );
  if (result.rowCount) return { adEvent: result.rows[0], duplicate: false };
  const existing = await query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1', [idempotencyKey]);
  return { adEvent: existing.rows[0], duplicate: true };
}

module.exports = { AD_CONTEXTS, recordAdvertisementCompletion };
