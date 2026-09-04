const AD_PROVIDER_CONTEXTS = ['task', 'gaming', 'daily_checkin', 'verification', 'squad'];
const GAMING_PROVIDER_ORDER = ['gigapub', 'monetag', 'onclicka'];

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
  if (provider.contexts.includes('task') && typeof provider.verifyServerCompletion !== 'function') throw new Error('Advertisement provider task context requires a trusted server verification contract');
}

class AdProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();
    this.contextEnabled = new Map();
    providers.forEach(provider => this.register(provider));
  }
  register(provider) {
    validateProvider(provider);
    if (this.providers.has(provider.id)) throw new Error(`Duplicate advertisement provider: ${provider.id}`);
    this.providers.set(provider.id, { enabled: true, ...provider });
    this.contextEnabled.set(provider.id, new Map(provider.contexts.map(context => [context, true])));
    return this.providers.get(provider.id);
  }
  get(providerId) { return this.providers.get(providerId) || null; }
  listRegistered() { return [...this.providers.keys()]; }
  setContextEnabled(providerId, context, enabled) {
    if (!AD_PROVIDER_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');
    const provider = this.get(providerId);
    if (!provider) throw new Error(`Unknown advertisement provider: ${providerId}`);
    if (!provider.contexts.includes(context)) throw new Error(`Advertisement provider ${providerId} does not support ${context}`);
    if (typeof enabled !== 'boolean') throw new Error('Provider context enabled state must be boolean');
    this.contextEnabled.get(providerId).set(context, enabled);
  }
  isContextEnabled(providerId, context) { return this.contextEnabled.get(providerId)?.get(context) === true; }
  listAvailable(context) {
    if (!AD_PROVIDER_CONTEXTS.includes(context)) throw new Error('Invalid advertisement context');
    return [...this.providers.values()].filter(provider => provider.enabled && provider.contexts.includes(context) && this.isContextEnabled(provider.id, context));
  }
}

function selectNextProvider(registry, { context, previousProviderId = null }) {
  if (!registry || typeof registry.listAvailable !== 'function' || typeof registry.listRegistered !== 'function') throw new Error('Advertisement provider registry is required');
  const available = registry.listAvailable(context);
  if (!available.length) throw new Error(`No advertisement provider available for ${context}`);
  const order = context === 'gaming' ? GAMING_PROVIDER_ORDER : registry.listRegistered();
  if (!previousProviderId) return order.map(id => available.find(provider => provider.id === id)).find(Boolean) || available[0];
  const previousIndex = order.indexOf(previousProviderId);
  if (previousIndex < 0) throw new Error(`Unknown previous advertisement provider: ${previousProviderId}`);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const providerId = order[(previousIndex + offset) % order.length];
    const provider = available.find(candidate => candidate.id === providerId);
    if (provider) return provider;
  }
  throw new Error(`No advertisement provider available for ${context}`);
}

function getProviderForVerification(registry, { context, providerId }) {
  if (!registry || typeof registry.get !== 'function') throw new Error('Advertisement provider registry is required');
  if (!providerId) throw new Error('Advertisement provider id is required');
  const provider = registry.get(providerId);
  if (!provider || !provider.enabled || !provider.contexts.includes(context) || !registry.isContextEnabled(providerId, context)) throw new Error(`Advertisement provider ${providerId} is not available for ${context}`);
  return provider;
}

function validateVerificationResult(result) {
  if (!result || typeof result.verified !== 'boolean') throw new Error('Advertisement provider returned an invalid verification result');
  if (result.verified && (typeof result.reference !== 'string' || !result.reference.trim())) throw new Error('Verified advertisement result requires a provider reference');
}

async function verifyProviderWithTimeout(provider, payload, timeoutMs) {
  let timer;
  try {
    return await Promise.race([provider.verifyCompletion(payload), new Promise((_, reject) => { timer = setTimeout(() => reject(new ProviderUnavailableError(`Advertisement provider ${provider.id} timed out`)), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function verifyWithProvider(registry, { context, providerId, payload, timeoutMs = 10000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Advertisement provider timeout must be positive');
  const provider = getProviderForVerification(registry, { context, providerId });
  const verification = await verifyProviderWithTimeout(provider, payload, timeoutMs);
  validateVerificationResult(verification);
  return { providerId: provider.id, verification };
}

module.exports = { AD_PROVIDER_CONTEXTS, GAMING_PROVIDER_ORDER, AdProviderRegistry, ProviderUnavailableError, selectNextProvider, getProviderForVerification, verifyWithProvider };
