const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const { getSquadModifierOnClient, recordSquadActivityOnClient } = require('./squad-activity-bridge');

const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_REWARD = { coin: 1000, dzx: 1, dzp: 1 };

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}
async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const n = Number(result.rows[0].value);
  return Number.isFinite(n) ? n : fallback;
}
async function getDailySettings(client) {
  const cooldownHours = await settingNumber(client, 'activity.daily_checkin_cooldown_hours', DEFAULT_COOLDOWN_HOURS);
  return {
    cooldownHours: cooldownHours > 0 ? cooldownHours : DEFAULT_COOLDOWN_HOURS,
    reward: {
      coin: await settingNumber(client, 'activity.daily_checkin_reward_coin', DEFAULT_REWARD.coin),
      dzx: await settingNumber(client, 'activity.daily_checkin_reward_dzx', DEFAULT_REWARD.dzx),
      dzp: await settingNumber(client, 'activity.daily_checkin_reward_dzp', DEFAULT_REWARD.dzp),
    },
  };
}

async function getDailyCheckin(userId, now = new Date()) {
  required(userId, 'userId');
  return withTransaction(async client => {
    const settings = await getDailySettings(client);
    const row = await client.query('SELECT * FROM daily_checkins WHERE user_id = $1 FOR UPDATE', [userId]);
    const checkin = row.rows[0] || null;
    const cooldownMs = settings.cooldownHours * 60 * 60 * 1000;
    const nextAvailableAt = checkin?.last_claimed_at ? new Date(new Date(checkin.last_claimed_at).getTime() + cooldownMs) : null;
    const available = !nextAvailableAt || now >= nextAvailableAt;
    return {
      available,
      status: available ? (checkin?.ad_event_id ? 'ad_pending' : 'available') : 'cooldown',
      lastClaimedAt: checkin?.last_claimed_at || null,
      nextAvailableAt: available ? null : nextAvailableAt,
      pendingAdEventId: available ? checkin?.ad_event_id || null : null,
      cooldownHours: settings.cooldownHours,
      reward: settings.reward,
    };
  });
}

async function startDailyCheckinAd({ userId, idempotencyKey, externalAdId = null }) {
  required(userId, 'userId'); required(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const settings = await getDailySettings(client);
    const row = await client.query('SELECT * FROM daily_checkins WHERE user_id = $1 FOR UPDATE', [userId]);
    const checkin = row.rows[0] || null;
    if (checkin?.last_claimed_at) {
      const next = new Date(new Date(checkin.last_claimed_at).getTime() + settings.cooldownHours * 60 * 60 * 1000);
      if (new Date() < next) throw new Error(`Daily check-in is on cooldown until ${next.toISOString()}`);
    }
    const existing = await client.query('SELECT * FROM activity_ad_events WHERE idempotency_key = $1 FOR SHARE', [idempotencyKey]);
    if (existing.rowCount) return { adEvent: existing.rows[0], duplicate: true };
    const ad = await client.query(
      `INSERT INTO activity_ad_events (user_id, context, external_ad_id, idempotency_key, metadata)
       VALUES ($1,'daily_checkin',$2,$3,$4) RETURNING *`,
      [userId, externalAdId, idempotencyKey, { purpose: 'daily_checkin', reward: settings.reward }]
    );
    await client.query(
      `INSERT INTO daily_checkins (user_id, ad_event_id, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET ad_event_id=$2, updated_at=NOW()`,
      [userId, ad.rows[0].id]
    );
    return { adEvent: ad.rows[0], duplicate: false };
  });
}

async function claimDailyCheckin({ userId, adEventId, idempotencyKey, now = new Date() }) {
  required(userId, 'userId'); required(adEventId, 'adEventId'); required(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const existingClaim = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [idempotencyKey]);
    if (existingClaim.rowCount) return { duplicate: true, status: 'claimed', transaction: existingClaim.rows[0] };
    const settings = await getDailySettings(client);
    const row = await client.query('SELECT * FROM daily_checkins WHERE user_id = $1 FOR UPDATE', [userId]);
    const checkin = row.rows[0] || null;
    if (checkin?.last_claimed_at) {
      const next = new Date(new Date(checkin.last_claimed_at).getTime() + settings.cooldownHours * 60 * 60 * 1000);
      if (now < next) throw new Error(`Daily check-in is on cooldown until ${next.toISOString()}`);
    }
    if (String(checkin?.ad_event_id || '') !== String(adEventId)) throw new Error('Daily check-in advertisement is not the active event');
    const ad = await client.query(`SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context='daily_checkin' FOR UPDATE`, [adEventId, userId]);
    if (!ad.rowCount) throw new Error('Daily check-in advertisement not found');
    if (!ad.rows[0].verified || !ad.rows[0].completed_at) throw new Error('Daily check-in advertisement must be completed first');
    const modifier = await getSquadModifierOnClient(client, userId, now);
    const reward = await creditActivityRewardOnClient(client, { idempotencyKey, userId, source: 'daily_checkin', ...settings.reward, modifiers: modifier.eligible ? [modifier] : [] });
    await recordSquadActivityOnClient(client, {
      userId, activityType: 'daily_checkin', activityId: String(adEventId), quantity: 1, occurredAt: now,
      idempotencyKey: `squad:daily_checkin:${idempotencyKey}`,
      metadata: { ad_event_id: adEventId, reward_transaction_id: reward.transaction.id },
    });
    await client.query(`UPDATE daily_checkins SET last_claimed_at=$2, claim_idempotency_key=$3, updated_at=NOW() WHERE user_id=$1`, [userId, now, idempotencyKey]);
    return { duplicate: false, status: 'claimed', transaction: reward.transaction, nextAvailableAt: new Date(now.getTime() + settings.cooldownHours * 60 * 60 * 1000) };
  });
}

async function markDailyCheckinAdCompleted({ userId, adEventId, externalAdId = null, metadata = {} }) {
  required(userId, 'userId'); required(adEventId, 'adEventId');
  return withTransaction(async client => {
    const result = await client.query(
      `UPDATE activity_ad_events SET completed_at=COALESCE(completed_at,NOW()), verified=TRUE, external_ad_id=COALESCE($3,external_ad_id), metadata=metadata || $4::jsonb WHERE id=$1 AND user_id=$2 AND context='daily_checkin' RETURNING *`,
      [adEventId, userId, externalAdId, JSON.stringify(metadata)]
    );
    if (!result.rowCount) throw new Error('Daily check-in advertisement not found');
    return { adEvent: result.rows[0] };
  });
}

async function markLatestDailyAdCompletedByTelegramId(telegramUserId, externalAdId = null) {
  return withTransaction(async client => {
    const user = await client.query('SELECT id FROM users WHERE telegram_user_id=$1', [String(telegramUserId)]);
    if (!user.rowCount) throw new Error('Telegram user is not registered');
    const userId = user.rows[0].id;
    const pending = await client.query(
      `SELECT e.* FROM activity_ad_events e JOIN daily_checkins d ON d.ad_event_id=e.id
       WHERE e.user_id=$1 AND e.context='daily_checkin' AND e.verified=FALSE ORDER BY e.id DESC LIMIT 1 FOR UPDATE`, [userId]
    );
    if (!pending.rowCount) return { completed: false, reason: 'no_pending_daily_ad' };
    const updated = await client.query(`UPDATE activity_ad_events SET completed_at=NOW(), verified=TRUE, external_ad_id=COALESCE($2,external_ad_id) WHERE id=$1 RETURNING *`, [pending.rows[0].id, externalAdId]);
    return { completed: true, adEvent: updated.rows[0] };
  });
}

async function resolveUserIdFromTelegram(telegramUserId) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id = $1', [String(telegramUserId)]);
  if (!result.rowCount) throw new Error('Telegram user is not registered');
  return result.rows[0].id;
}

module.exports = { getDailyCheckin, startDailyCheckinAd, claimDailyCheckin, markDailyCheckinAdCompleted, markLatestDailyAdCompletedByTelegramId, resolveUserIdFromTelegram };
