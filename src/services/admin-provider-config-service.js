const { AD_PROVIDER_CONTEXTS } = require('./ad-provider-service');

function validateProviderConfiguration(config, registeredProviderIds) {
  if (!config || typeof config !== 'object') throw new Error('Provider configuration is required');
  if (!Array.isArray(registeredProviderIds) || !registeredProviderIds.includes(config.providerId)) {
    throw new Error(`Provider ${config.providerId || ''} is not registered`);
  }
  if (!Array.isArray(config.contexts) || config.contexts.length === 0) {
    throw new Error('Advertisement provider contexts are required');
  }
  if (config.contexts.some(context => !AD_PROVIDER_CONTEXTS.includes(context))) {
    throw new Error('Invalid advertisement context');
  }
  const priority = config.priority ?? 100;
  const timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isInteger(priority) || priority <= 0) throw new Error('Advertisement provider priority must be positive');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Advertisement provider timeout must be positive');
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    throw new Error('Advertisement provider enabled must be boolean');
  }
  return {
    providerId: config.providerId,
    enabled: config.enabled ?? true,
    priority,
    contexts: [...new Set(config.contexts)],
    timeoutMs,
  };
}

module.exports = { validateProviderConfiguration };
