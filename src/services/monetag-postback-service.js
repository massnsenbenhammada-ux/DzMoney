const MONETAG_ZONE_ID = '11627577';
const MONETAG_CONTEXT = 'daily_checkin';

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return String(value);
}

/** Validate the trusted Monetag postback fields used by Daily Check-in. */
function validateMonetagPostback(payload = {}) {
  const telegramId = required(payload.telegram_id, 'telegram id');
  const zoneId = required(payload.zone_id, 'zone id');
  const eventType = required(payload.event_type, 'event type');
  const rewardEventType = required(payload.reward_event_type, 'reward event type');
  const ymid = required(payload.ymid, 'ymid');
  const requestVar = required(payload.request_var, 'request var');
  const price = Number(payload.estimated_price);

  if (zoneId !== MONETAG_ZONE_ID) throw new Error('Monetag zone does not match');
  if (eventType !== 'impression') throw new Error('Monetag event is not an impression');
  if (rewardEventType !== 'yes') throw new Error('Monetag event is not a rewarded event');
  if (requestVar !== MONETAG_CONTEXT) throw new Error('Monetag request context does not match');
  if (!Number.isFinite(price) || price < 0) throw new Error('Monetag estimated price is invalid');

  return { eligible: true, telegramId, ymid, requestVar, zoneId, eventType, rewardEventType, estimatedPrice: price };
}

module.exports = { MONETAG_ZONE_ID, MONETAG_CONTEXT, validateMonetagPostback };
