const REFERRAL_MODES = ['disabled', 'link_only', 'link_and_owner_verification'];
const VERIFICATION_MODES = ['automatic', 'custom'];
const SECRET_KEYS = new Set(['apiKey', 'apiSecret', 'secret', 'token', 'accessToken', 'clientSecret']);

function validateReferral(referral = {}) {
  const mode = referral.mode || 'disabled';
  if (!REFERRAL_MODES.includes(mode)) throw new Error('Invalid external referral mode');
  if (mode !== 'disabled' && !referral.referralUrlTemplate) throw new Error('referralUrlTemplate is required');
  if (mode === 'link_and_owner_verification' && !referral.ownerVerification) {
    throw new Error('owner verification configuration is required');
  }
}

function rejectSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) throw new Error('credentials must not be stored in task config');
    rejectSecrets(child);
  }
}

/** Validate task verification configuration without accessing external providers. */
function validateVerificationConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('verification config must be an object');
  rejectSecrets(config);
  const verification = config.verification || {};
  if (typeof verification !== 'object' || Array.isArray(verification)) {
    throw new Error('verification config must be an object');
  }
  const mode = verification.mode || 'automatic';
  if (!VERIFICATION_MODES.includes(mode)) throw new Error('Invalid verification mode');
  validateReferral(config.referral);
  return true;
}

/** Resolve safe verification defaults and task-specific overrides. */
function resolveVerificationConfig({ taskType, config = {} }) {
  const source = config && typeof config === 'object' ? config : {};
  validateVerificationConfig(source);
  const verification = source.verification || {};
  const referral = source.referral || {};
  return {
    taskType,
    verification: {
      mode: verification.mode || 'automatic',
      provider: verification.provider || null,
      providerConfigRef: verification.providerConfigRef || null
    },
    referral: {
      mode: referral.mode || 'disabled',
      referralUrlTemplate: referral.referralUrlTemplate || null,
      ownerVerification: referral.ownerVerification || null
    }
  };
}

module.exports = { REFERRAL_MODES, VERIFICATION_MODES, validateVerificationConfig, resolveVerificationConfig };
