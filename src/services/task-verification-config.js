const REFERRAL_MODES = ['disabled', 'link_only', 'link_and_owner_verification'];
const VERIFICATION_MODES = ['automatic', 'custom'];
const COMPLETION_MODES = ['open_link', 'server_verified'];
const VERIFICATION_METHODS = ['api', 'webhook', 'callback', 'telegram_bot_api', 'token_callback', 'signed_webhook', 'hmac_callback'];
const TASK_TYPES = ['daily', 'game', 'social', 'web', 'special'];
const SECRET_KEYS = new Set(['apiKey', 'apiSecret', 'secret', 'token', 'accessToken', 'clientSecret']);

const SERVER_VERIFIED_CONTRACTS = Object.freeze({
  daily: Object.freeze({ status: 'contract', source: 'ad_provider', evidence: 'activity_ad_events', method: 'provider_event_validation', identity: 'user_and_task_correlation', requiredUserInput: Object.freeze({ status: 'provider_contract_required', fields: Object.freeze([]) }), replay: 'provider_event_idempotency' }),
  game: Object.freeze({ status: 'contract', source: 'mini_app_backend', evidence: 'trusted_completion_evidence', method: 'backend_evidence_validation', identity: 'telegram_init_data_user_correlation', requiredUserInput: Object.freeze({ status: 'provider_contract_required', fields: Object.freeze([]) }), replay: 'completion_event_idempotency' }),
  social: Object.freeze({ status: 'contract', source: 'telegram_or_social_provider', evidence: 'action_specific_evidence', method: 'provider_specific_validation', identity: 'authenticated_user_correlation', requiredUserInput: Object.freeze({ status: 'provider_contract_required', fields: Object.freeze([]) }), replay: 'evidence_idempotency' }),
  web: Object.freeze({ status: 'contract', source: 'external_site_or_provider', evidence: 'signed_webhook_or_unique_token', method: 'signed_evidence_validation', identity: 'user_and_task_correlation', requiredUserInput: Object.freeze({ status: 'provider_contract_required', fields: Object.freeze([]) }), replay: 'event_or_token_idempotency' }),
  special: Object.freeze({ status: 'contract', source: 'partner_backend', evidence: 'signed_or_hmac_evidence', method: 'partner_signature_validation', identity: 'user_and_task_correlation', requiredUserInput: Object.freeze({ status: 'contract_required', fields: Object.freeze([]) }), replay: 'partner_event_idempotency' })
});

function validateReferral(referral = {}) {
  const mode = referral.mode || 'disabled';
  if (!REFERRAL_MODES.includes(mode)) throw new Error('Invalid external referral mode');
  if (mode !== 'disabled' && !referral.referralUrlTemplate) throw new Error('referralUrlTemplate is required');
  if (mode === 'link_and_owner_verification' && !referral.ownerVerification) throw new Error('owner verification configuration is required');
}

function validateCompletion(completion = {}, taskType = null) {
  const mode = completion.mode || 'server_verified';
  if (!COMPLETION_MODES.includes(mode)) throw new Error('Invalid task completion mode');
  const usesDynamicReferralLink = completion.urlSource === 'user_referral_link';
  if (mode === 'open_link' && !completion.url && !usesDynamicReferralLink) throw new Error('completion.url or a supported urlSource is required for open_link tasks');
  if (usesDynamicReferralLink && taskType !== 'daily') throw new Error('user_referral_link urlSource is supported only for Daily tasks');
  if (taskType === 'special' && mode !== 'server_verified') throw new Error('Special/Partner tasks support server_verified completion only');
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
  if (!hasProvider && (hasMethod || hasEvent)) throw new Error('provider is required when provider evidence is configured');
  if (!hasProvider) return;
  if (!hasMethod) {
    if (hasEvent) throw new Error('verification method is required when an evidence event is configured');
    if (verification.providerConfigRef !== undefined && verification.providerConfigRef !== null && typeof verification.providerConfigRef !== 'string') throw new Error('providerConfigRef must be a string');
    return;
  }
  if (!VERIFICATION_METHODS.includes(verification.method)) throw new Error('Invalid verification method');
  if (!hasEvent || typeof verification.event !== 'string') throw new Error('verification event is required');
  if (verification.providerConfigRef !== undefined && verification.providerConfigRef !== null && typeof verification.providerConfigRef !== 'string') {
    throw new Error('providerConfigRef must be a string');
  }
}

/** Validate task verification configuration without accessing external providers. */
function validateVerificationConfig(config = {}, taskType = null) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('verification config must be an object');
  if (taskType !== null && !TASK_TYPES.includes(taskType)) throw new Error('Invalid task type');
  rejectSecrets(config);
  const verification = config.verification || {};
  if (typeof verification !== 'object' || Array.isArray(verification)) throw new Error('verification config must be an object');
  const completion = config.completion || {};
  if (typeof completion !== 'object' || Array.isArray(completion)) throw new Error('completion config must be an object');
  const mode = verification.mode || 'automatic';
  if (!VERIFICATION_MODES.includes(mode)) throw new Error('Invalid verification mode');
  validateProviderEvidence(verification);
  validateCompletion(completion, taskType);
  validateReferral(config.referral);
  return true;
}

/** Resolve safe verification defaults and task-specific overrides. */
function resolveVerificationConfig({ taskType, config = {} }) {
  const source = config && typeof config === 'object' ? config : {};
  validateVerificationConfig(source, taskType);
  const verification = source.verification || {};
  const completion = source.completion || {};
  const referral = source.referral || {};
  return {
    taskType,
    completion: { mode: completion.mode || 'server_verified', url: completion.url || null, urlSource: completion.urlSource || null },
    serverVerified: SERVER_VERIFIED_CONTRACTS[taskType] || null,
    verification: {
      mode: verification.mode || 'automatic',
      provider: verification.provider || null,
      providerConfigRef: verification.providerConfigRef || null,
      method: verification.method || null,
      event: verification.event || null,
      channel: verification.channel || null
    },
    referral: { mode: referral.mode || 'disabled', referralUrlTemplate: referral.referralUrlTemplate || null, ownerVerification: referral.ownerVerification || null }
  };
}

module.exports = { REFERRAL_MODES, VERIFICATION_MODES, COMPLETION_MODES, VERIFICATION_METHODS, TASK_TYPES, SERVER_VERIFIED_CONTRACTS, validateVerificationConfig, resolveVerificationConfig };
