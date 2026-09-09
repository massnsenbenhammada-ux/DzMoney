const { query, withTransaction } = require("../db/pool");

const REFERRAL_SETTING_KEYS = new Set([
  "referral.reward_coin",
  "referral.reward_dzx",
  "referral.reward_dzp",
  "referral.lifetime_percent",
]);

function normalizeSettingValue(key, value) {
  if (typeof value === "boolean" || value === null || value === undefined)
    throw new Error("Referral setting value is invalid");
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text)))
    throw new Error("Referral setting value is invalid");
  if (Number(text) < 0)
    throw new Error("Referral setting value must be non-negative");
  if (key === "referral.lifetime_percent" && Number(text) > 100)
    throw new Error("Lifetime percentage must not exceed 100");
  if (text.replace(/^0+/, "").replace(".", "").length > 21)
    throw new Error("Referral setting exceeds supported precision");
  return Number(text);
}

async function getReferralSettings() {
  const result = await query(
    `SELECT key, value FROM admin_settings
     WHERE key IN ('referral.reward_coin', 'referral.reward_dzx', 'referral.reward_dzp', 'referral.lifetime_percent')
     ORDER BY key`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

async function setReferralSetting({ key, value, actorTelegramUserId }) {
  if (!REFERRAL_SETTING_KEYS.has(key))
    throw new Error("Unsupported referral setting");
  if (!actorTelegramUserId) throw new Error("Admin actor is required");
  const normalized = normalizeSettingValue(key, value);

  return withTransaction(async (client) => {
    const current = await client.query(
      "SELECT value FROM admin_settings WHERE key = $1 FOR UPDATE",
      [key],
    );
    if (!current.rowCount)
      throw new Error("Referral setting is not initialized");
    const oldValue = current.rows[0].value;
    if (String(oldValue) === String(normalized))
      return { key, value: oldValue, changed: false };
    await client.query(
      `UPDATE admin_settings SET value = $1::jsonb, updated_at = NOW() WHERE key = $2`,
      [JSON.stringify(normalized), key],
    );
    await client.query(
      `INSERT INTO admin_audit_log(setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
      [
        key,
        JSON.stringify(oldValue),
        JSON.stringify(normalized),
        actorTelegramUserId,
      ],
    );
    return { key, value: normalized, changed: true };
  });
}

module.exports = {
  getReferralSettings,
  setReferralSetting,
  normalizeSettingValue,
};
