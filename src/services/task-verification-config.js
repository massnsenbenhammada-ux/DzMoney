const REFERRAL_MODES = ['disabled', 'link_only', 'link_and_owner_verification'];
const TASK_TYPES = ['daily', 'game', 'social', 'web', 'special'];
const CREATOR_TASK_TYPES = ['game', 'social', 'web'];
const CREATOR_VERIFICATION_METHODS = Object.freeze({
  game: Object.freeze(['click_proof', 'url_format_match']),
  social: Object.freeze(['click_proof', 'bot_api']),
  web: Object.freeze(['click_proof'])
});
const SECRET_KEYS = new Set(['apiKey', 'apiSecret', 'secret', 'token', 'accessToken', 'clientSecret']);
const TELEGRAM_CHANNEL_PATTERN = /^@[A-Za-z0-9_]{5,32}$/;

const CREATOR_PROVIDER_CONTRACTS = Object.freeze({
  social: Object.freeze([
    Object.freeze({
      id: 'telegram_channel',
      label: 'Telegram Bot API',
      method: 'bot_api',
      event: 'channel_membership',
      fields: Object.freeze([
        Object.freeze({ key: 'channel', label: 'Telegram channel', type: 'telegram_channel', required: true })
      ])
    })
  ]),
  game: Object.freeze([]),
  web: Object.freeze([])
});

function validateReferral(referral = {}) {
  const mode = referral.mode || 'disabled';
  if (!REFERRAL_MODES.includes(mode)) throw new Error('Invalid external referral mode');
  if (mode !== 'disabled' && !referral.referralUrlTemplate) throw new Error('referralUrlTemplate is required');
  if (mode === 'link_and_owner_verification' && !referral.ownerVerification) throw new Error('owner verification configuration is required');
}

function rejectSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) throw new Error('credentials must not be stored in task config');
    rejectSecrets(child);
  }
}

function validateProviderEvidence(verification = {}) {
  const hasProvider = Boolean(verification.provider);
  const hasMethod = Boolean(verification.method);
  const hasEvent = Boolean(verification.event);
  if (!hasProvider && !hasMethod && !hasEvent) return;
  if (!hasProvider) {
    if (!hasMethod || typeof verification.method !== 'string' || verification.method.trim() === '') throw new Error('verification method is required');
    if (hasEvent) throw new Error('provider is required when a verification event is configured');
    return;
  }
  if (!hasMethod || typeof verification.method !== 'string' || verification.method.trim() === '') throw new Error('verification method is required');
  if (!hasEvent || typeof verification.event !== 'string') throw new Error('verification event is required');
  if (verification.providerConfigRef !== undefined && verification.providerConfigRef !== null && typeof verification.providerConfigRef !== 'string') throw new Error('providerConfigRef must be a string');
}

function validateCreatorVerificationContract(taskType, verification = {}, campaignUrl = null) {
  if (!CREATOR_TASK_TYPES.includes(taskType)) throw new Error('Invalid creator task type');
  const allowed = CREATOR_VERIFICATION_METHODS[taskType];
  if (!allowed.includes(verification.method)) throw new Error(`Invalid verification method for ${taskType} creator task`);
  if (typeof campaignUrl !== 'string' || campaignUrl.trim() === '') throw new Error('campaignUrl is required for creator tasks');
  if (verification.method === 'click_proof') {
    if (verification.provider || verification.event || verification.providerConfigRef || verification.requirements) throw new Error('click_proof does not use a provider contract');
    return;
  }
  if (verification.method === 'url_format_match') {
    if (taskType !== 'game') throw new Error('url_format_match is supported only for Game tasks');
    if (verification.provider || verification.event || verification.providerConfigRef || verification.requirements) throw new Error('url_format_match does not use a provider contract');
    return;
  }
  if (verification.method !== 'bot_api' || taskType !== 'social') throw new Error('Invalid creator verification contract');
  const provider = CREATOR_PROVIDER_CONTRACTS.social[0];
  if (verification.provider !== provider.id) throw new Error('Creator Bot API provider is not enabled');
  if (verification.event !== provider.event) throw new Error('Creator Bot API event does not match the provider contract');
  validateCreatorProviderRequirements(provider, verification.requirements);
}

function validateCreatorProviderRequirements(provider, requirements = {}) {
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) throw new Error('provider requirements must be an object');
  if (provider.id === 'telegram_channel') {
    if (typeof requirements.channel !== 'string' || !TELEGRAM_CHANNEL_PATTERN.test(requirements.channel.trim())) throw new Error('Invalid Telegram channel requirement');
    return { channel: requirements.channel.trim() };
  }
  throw new Error(`Unsupported creator provider: ${provider.id}`);
}

function validateCreatorProviderConfiguration(taskType, config = {}) {
  if (Object.prototype.hasOwnProperty.call(config, 'completion')) throw new Error('Legacy Creator completion contract is not supported');
  validateVerificationConfig(config, taskType);
  const verification = config.verification || {};
  validateCreatorVerificationContract(taskType, verification, config.campaignUrl);
  return true;
}

function validateVerificationConfig(config = {}, taskType = null) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('verification config must be an object');
  if (taskType !== null && !TASK_TYPES.includes(taskType)) throw new Error('Invalid task type');
  rejectSecrets(config);
  if (Object.prototype.hasOwnProperty.call(config, 'completion')) throw new Error('Legacy completion configuration is not supported');
  const verification = config.verification || {};
  if (typeof verification !== 'object' || Array.isArray(verification)) throw new Error('verification config must be an object');
  validateProviderEvidence(verification);
  validateReferral(config.referral);
  if (taskType === 'game' && verification.method === 'url_format_match') {
    if (typeof config.campaignUrl !== 'string' || config.campaignUrl.trim() === '') throw new Error('campaignUrl is required for url_format_match');
    if (verification.provider || verification.event || verification.providerConfigRef) throw new Error('url_format_match does not use a provider contract');
  }
  if (taskType === 'game' && verification.method === 'click_proof' && (verification.provider || verification.event || verification.providerConfigRef)) throw new Error('click_proof does not use a provider contract');
  return true;
}

function resolveVerificationConfig({ taskType, config = {} }) {
  const source = config && typeof config === 'object' ? config : {};
  validateVerificationConfig(source, taskType);
  const verification = source.verification || {};
  const referral = source.referral || {};
  return {
    taskType,
    campaignUrl: source.campaignUrl || null,
    verification: {
      provider: verification.provider || null,
      providerConfigRef: verification.providerConfigRef || null,
      method: verification.method || null,
      event: verification.event || null,
      channel: verification.channel || null,
      requirements: verification.requirements && typeof verification.requirements === 'object' ? { ...verification.requirements } : {}
    },
    referral: { mode: referral.mode || 'disabled', referralUrlTemplate: referral.referralUrlTemplate || null, ownerVerification: referral.ownerVerification || null }
  };
}

function getCreatorProviderContracts(taskType) {
  if (!CREATOR_TASK_TYPES.includes(taskType)) throw new Error('Invalid creator task type');
  return (CREATOR_PROVIDER_CONTRACTS[taskType] || []).map(contract => ({
    id: contract.id,
    label: contract.label,
    method: contract.method,
    event: contract.event,
    fields: contract.fields.map(field => ({ ...field }))
  }));
}

module.exports = {
  REFERRAL_MODES,
  TASK_TYPES,
  CREATOR_TASK_TYPES,
  CREATOR_VERIFICATION_METHODS,
  CREATOR_PROVIDER_CONTRACTS,
  getCreatorProviderContracts,
  validateCreatorVerificationContract,
  validateCreatorProviderConfiguration,
  validateVerificationConfig,
  resolveVerificationConfig
};