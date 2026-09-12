const { query, withTransaction } = require('../db/pool');

const SQUAD_SETTING_KEYS = new Set([
  'squad.membership_tiers',
  'squad.daily_target_dzp_per_member',
  'squad.daily_verified_ad_target',
]);

async function getSquadSettings() {
  const result = await query(
    `SELECT key, value FROM admin_settings
     WHERE key IN ('squad.membership_tiers', 'squad.daily_target_dzp_per_member', 'squad.daily_verified_ad_target')
     ORDER BY key`
  );
  return {
    settings: Object.fromEntries(result.rows.map(row => [row.key, row.value])),
    modifierFormula: 'Total raw verified activity contribution DZP / 100',
    modifierCurrencies: ['COIN', 'DZX', 'DZP'],
    modifierCapped: false,
    source: 'Verified Activity',
  };
}

function normalizeSetting(key, value) {
  if (key === 'squad.membership_tiers') {
    if (!Array.isArray(value) || !value.length) throw new Error('Membership tiers must be a non-empty array');
    const tiers = value.map(tier => ({
      minMembers: Number(tier.minMembers),
      maxMembers: tier.maxMembers == null ? null : Number(tier.maxMembers),
      price: Number(tier.price),
    }));
    if (tiers.some(tier => !Number.isInteger(tier.minMembers) || tier.minMembers < 1 || (tier.maxMembers !== null && (!Number.isInteger(tier.maxMembers) || tier.maxMembers < tier.minMembers)) || !Number.isFinite(tier.price) || tier.price <= 0)) {
      throw new Error('Invalid Squad membership tier configuration');
    }
    for (let index = 1; index < tiers.length; index += 1) {
      const previous = tiers[index - 1];
      if (previous.maxMembers === null || tiers[index].minMembers !== previous.maxMembers + 1) throw new Error('Squad membership tiers must be contiguous');
    }
    return tiers;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Squad setting must be a non-negative number');
  if (key === 'squad.daily_verified_ad_target' && !Number.isInteger(numeric)) throw new Error('Verified ad target must be an integer');
  return numeric;
}

async function setSquadSetting({ key, value, actorTelegramUserId }) {
  if (!SQUAD_SETTING_KEYS.has(key)) throw new Error('Unsupported Squad setting');
  if (!actorTelegramUserId) throw new Error('Admin actor is required');
  const normalized = normalizeSetting(key, value);
  return withTransaction(async client => {
    const current = await client.query('SELECT value FROM admin_settings WHERE key=$1 FOR UPDATE', [key]);
    if (!current.rowCount) throw new Error('Squad setting is not initialized');
    const oldValue = current.rows[0].value;
    if (JSON.stringify(oldValue) === JSON.stringify(normalized)) return { key, value: oldValue, changed: false };
    await client.query('UPDATE admin_settings SET value=$1::jsonb, updated_at=NOW() WHERE key=$2', [JSON.stringify(normalized), key]);
    await client.query(
      `INSERT INTO admin_audit_log(setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1,$2::jsonb,$3::jsonb,$4)`,
      [key, JSON.stringify(oldValue), JSON.stringify(normalized), actorTelegramUserId]
    );
    return { key, value: normalized, changed: true };
  });
}

module.exports = { getSquadSettings, setSquadSetting, normalizeSetting };
