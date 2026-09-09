const { withTransaction } = require('../db/pool');
const { ADSGRAM_BLOCK_ID } = require('../config/adsgram');

// AdsGram deliberately has no per-impression provider id in the documented Reward URL; only a client-started event may accept provider confirmation.
async function getPendingEvent(client, { userId, adEventId }) {
  const result = await client.query(
    "SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context IN ('task','squad') AND verified=FALSE AND metadata->>'provider_id'='adsgram' FOR UPDATE",
    [adEventId, userId],
  );
  if (!result.rowCount)
    throw new Error('AdsGram advertisement event not found');
  return result.rows[0];
}

function nextState(event, field) {
  return { ...(event.metadata?.provider_state || {}), [field]: true };
}

async function markClientStarted({ userId, adEventId }) {
  return withTransaction(async (client) => {
    const event = await getPendingEvent(client, { userId, adEventId });
    if (event.metadata?.provider_state?.client_started === true)
      return { started: true, duplicate: true, adEvent: event };
    const state = nextState(event, 'client_started');
    const updated = await client.query(
      'UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1 RETURNING *',
      [adEventId, JSON.stringify({ provider_state: state })],
    );
    return { started: true, duplicate: false, adEvent: updated.rows[0] };
  });
}

async function markClientCompleted({ userId, adEventId }) {
  return withTransaction(async (client) => {
    const event = await getPendingEvent(client, { userId, adEventId });
    const current = event.metadata?.provider_state || {};
    if (current.client_started !== true)
      throw new Error('AdsGram advertisement has not started');
    const state = nextState(event, 'client_completed');
    if (current.client_completed === true) {
      return {
        ready:
          state.client_completed === true && state.provider_confirmed === true,
        rewarded: false,
        adEvent: event,
        duplicate: true,
      };
    }
    const updated = await client.query(
      'UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1 RETURNING *',
      [adEventId, JSON.stringify({ provider_state: state })],
    );
    return finalizeIfReady(client, updated.rows[0], state);
  });
}

async function markProviderConfirmed({ userTelegramId, providerReference }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT a.*
       FROM activity_ad_events a
       JOIN users u ON u.id=a.user_id
       WHERE u.telegram_user_id=$1
         AND a.context IN ('task','squad')
         AND a.verified=FALSE
         AND a.metadata->>'provider_id'='adsgram'
         AND a.metadata->>'adsgram_block_id'=$2
         AND COALESCE((a.metadata->'provider_state'->>'client_started')::boolean,FALSE)=TRUE
       ORDER BY a.id DESC
       LIMIT 1
       FOR UPDATE`,
      [String(userTelegramId), ADSGRAM_BLOCK_ID],
    );
    if (!result.rowCount)
      throw new Error(
        'No started AdsGram advertisement matches the provider callback',
      );
    const event = result.rows[0];
    const current = event.metadata?.provider_state || {};
    if (current.provider_confirmed === true) {
      return {
        ready: current.client_completed === true,
        rewarded: false,
        adEvent: event,
        duplicate: true,
      };
    }
    const state = nextState(event, 'provider_confirmed');
    const updated = await client.query(
      'UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1 RETURNING *',
      [
        event.id,
        JSON.stringify({
          provider_reference: String(providerReference),
          provider_state: state,
        }),
      ],
    );
    return finalizeIfReady(client, updated.rows[0], state);
  });
}

async function finalizeIfReady(client, event, state) {
  if (!(
    state.client_started === true &&
    state.client_completed === true &&
    state.provider_confirmed === true
  )) {
    return { ready: false, rewarded: false, adEvent: event, duplicate: false };
  }
  const reference = event.metadata?.provider_reference || `adsgram:${event.id}`;
  const result = await client.query(
    `UPDATE activity_ad_events
     SET completed_at=COALESCE(completed_at,NOW()),
         verified=TRUE,
         metadata=metadata || $2::jsonb
     WHERE id=$1 AND verified=FALSE
     RETURNING *`,
    [
      event.id,
      JSON.stringify({
        provider_reference: reference,
        provider_verification: {
          provider_id: 'adsgram',
          block_id: ADSGRAM_BLOCK_ID,
          client_started: true,
          client_completed: true,
          provider_confirmed: true,
          source: 'adsgram_dual_confirmation',
        },
      }),
    ],
  );
  return {
    ready: true,
    rewarded: false,
    adEvent: result.rows[0] || event,
    duplicate: false,
  };
}

module.exports = {
  markClientStarted,
  markClientCompleted,
  markProviderConfirmed,
  ADSGRAM_BLOCK_ID,
};
