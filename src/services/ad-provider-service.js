const AD_PROVIDER_CONTEXTS = ['task', 'reward_pool', 'daily_checkin', 'verification'];

class ProviderUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

function validateProvider(provider) {
  if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) throw new Error('Advertisement provider id is required');
  if (!Array.isArray(provider.contexts) || !provider.contexts.length) throw new Error('Advertisement provider contexts are required');
  if (provider.contexts.some(context => !AD_PROVIDER_CONTEXTS.includes(context))) throw new Error('Invalid advertisement context');
  if (typeof provider.verifyCompletion !== 'function') throw new Error('Advertisement provider verifyCompletion is required');
}

class AdProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();
    providers.forEach(provider => this.register(provider));
  }

  register(provider) {
    validateProvider(provider);
    if (this.providers.has(provider.id)) throw new Error(`Duplicate advertisement provider: ${provider.id}`);
    this.providers.set(provider.id, { enabled: true, priority: 100, ...provider });
    return this.providers.get(provider.id);
  }

  get(providerId) {
    return this.providers.get(providerId) || null;
  }

  listAvailable(context) {
    if (!AD_PROVIDER_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');
    return [...this.providers.values()]
      .filter(provider => provider.enabled && provider.contexts.includes(context))
      .sort((left, right) => right.priority - left.priority);
  }
}

function selectProvider(registry, { context, providerId = null, excludedProviderIds = [] }) {
  if (!registry || typeof registry.listAvailable !== 'function') throw new Error('Advertisement provider registry is required');
  if (providerId) {
    const provider = registry.get(providerId);
    if (!provider || !provider.enabled || !provider.contexts.includes(context) || excludedProviderIds.includes(providerId)) {
      throw new Error(`Advertisement provider ${providerId} is not available for ${context}`);
    }
    return provider;
  }
  const provider = registry.listAvailable(context).find(candidate => !excludedProviderIds.includes(candidate.id));
  if (!provider) throw new Error(`No advertisement provider available for ${context}`);
  return provider;
}

function validateVerificationResult(result) {
  if (!result || typeof result.verified !== 'boolean') throw new Error('Advertisement provider returned an invalid verification result');
  if (result.verified && (typeof result.reference !== 'string' || !result.reference.trim())) throw new Error('Verified advertisement result requires a provider reference');
}

async function verifyProviderWithTimeout(provider, payload, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      provider.verifyCompletion(payload),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ProviderUnavailableError(`Advertisement provider ${provider.id} timed out`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function verifyWithProvider(registry, { context, providerId = null, payload, timeoutMs = 10000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Advertisement provider timeout must be positive');
  const attempted = [];
  while (true) {
    const provider = selectProvider(registry, { context, providerId, excludedProviderIds: attempted });
    attempted.push(provider.id);
    try {
      const verification = await verifyProviderWithTimeout(provider, payload, timeoutMs);
      validateVerificationResult(verification);
      return { providerId: provider.id, verification };
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      if (providerId || attempted.length >= registry.listAvailable(context).length) throw error;
    }
  }
}

module.exports = {
  AD_PROVIDER_CONTEXTS,
  AdProviderRegistry,
  ProviderUnavailableError,
  selectProvider,
  verifyWithProvider
};
