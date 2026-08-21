const { query, withTransaction } = require('../db/pool');
const { AD_PROVIDER_CONTEXTS } = require('./ad-provider-service');

function validateProviderConfiguration(config, registeredProviderIds) {
  if (!config || typeof config !== 'object') throw new Error('Provider configuration is required');
  if (!Array.isArray(registeredProviderIds) || !registeredProviderIds.includes(config.providerId)) {
    throw new Error(`Provider ${config.providerId || ''} is not registered`);
  }
  if (!Array.isArray(config.contexts) || config.contexts.length === 0) throw new Error('Advertisement provider contexts are required');
  if (config.contexts.some(context => !AD_PROVIDER_CONTEXTS.includes(context))) throw new Error('Invalid advertisement context');
  const priority = config.priority ?? 100;
  const timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isInteger(priority) || priority <= 0) throw new Error('Advertisement provider priority must be positive');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Advertisement provider timeout must be positive');
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw new Error('Advertisement provider enabled must be boolean');
  return { providerId: config.providerId, enabled: config.enabled ?? true, priority, contexts: [...new Set(config.contexts)], timeoutMs };
}

function validateConfigurations(configurations, registeredProviderIds) {
  if (!Array.isArray(configurations)) throw new Error('Provider configurations must be an array');
  return configurations.map(config => validateProviderConfiguration(config, registeredProviderIds));
}

async function loadProviderConfigurations(key = 'ads.providers') {
  const result = await query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  return result.rows[0]?.value ?? [];
}

async function saveProviderConfiguration({ key = 'ads.providers', configurations, registeredProviderIds, actorTelegramUserId }) {
  const normalized = validateConfigurations(configurations, registeredProviderIds);
  return withTransaction(async client => {
    const current = await client.query('SELECT value FROM admin_settings WHERE key = $1 FOR UPDATE', [key]);
    const oldValue = current.rows[0]?.value ?? [];
    await client.query(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(normalized)]
    );
    await client.query(
      `INSERT INTO admin_audit_log (setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
      [key, JSON.stringify(oldValue), JSON.stringify(normalized), actorTelegramUserId]
    );
    return normalized;
  });
}

module.exports = { validateProviderConfiguration, loadProviderConfigurations, saveProviderConfiguration };
