const assert = require('assert');
const {
  REFERRAL_MODES,
  VERIFICATION_MODES,
  COMPLETION_MODES,
  TASK_TYPES,
  SERVER_VERIFIED_CONTRACTS,
  resolveVerificationConfig,
  validateVerificationConfig
} = require('../src/services/task-verification-config');

function testVerificationModes() {
  assert.deepStrictEqual(VERIFICATION_MODES, ['automatic', 'custom']);
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: {} }).verification.mode, 'automatic');
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: { verification: { mode: 'custom', provider: 'partner' } } }).verification.mode, 'custom');
  assert.throws(() => validateVerificationConfig({ verification: { mode: 'unknown' } }), /Invalid verification mode/);
}

function testCompletionModes() {
  assert.deepStrictEqual(COMPLETION_MODES, ['open_link', 'server_verified']);
  assert.deepStrictEqual(TASK_TYPES, ['daily', 'game', 'social', 'web', 'special']);
  const defaultConfig = resolveVerificationConfig({ taskType: 'daily', config: {} });
  assert.strictEqual(defaultConfig.completion.mode, 'server_verified');
  assert.strictEqual(defaultConfig.completion.url, null);

  const openLink = resolveVerificationConfig({ taskType: 'web', config: { completion: { mode: 'open_link', url: 'https://example.test/task' } } });
  assert.strictEqual(openLink.completion.mode, 'open_link');
  assert.strictEqual(openLink.completion.url, 'https://example.test/task');

  assert.throws(() => validateVerificationConfig({ completion: { mode: 'open_link' } }), /completion.url is required for open_link tasks/);
  assert.throws(() => validateVerificationConfig({ completion: { mode: 'unknown' } }), /Invalid task completion mode/);
}

function testSpecialServerVerifiedOnly() {
  assert.doesNotThrow(() => validateVerificationConfig({ completion: { mode: 'server_verified' } }, 'special'));
  assert.throws(
    () => validateVerificationConfig({ completion: { mode: 'open_link', url: 'https://partner.example/task' } }, 'special'),
    /Special\/Partner tasks support server_verified completion only/
  );
  assert.throws(
    () => resolveVerificationConfig({ taskType: 'special', config: { completion: { mode: 'open_link', url: 'https://partner.example/task' } } }),
    /Special\/Partner tasks support server_verified completion only/
  );
  assert.strictEqual(resolveVerificationConfig({ taskType: 'special', config: {} }).completion.mode, 'server_verified');
}

function testServerVerifiedContracts() {
  const expected = {
    daily: { inputStatus: 'provider_contract_required' },
    game: { inputStatus: 'provider_contract_required' },
    social: { inputStatus: 'provider_contract_required' },
    web: { inputStatus: 'provider_contract_required' },
    special: { inputStatus: 'contract_required' }
  };
  for (const taskType of TASK_TYPES) {
    const resolved = resolveVerificationConfig({ taskType, config: {} });
    const contract = resolved.serverVerified;
    assert.ok(contract, `${taskType} must expose a Server Verified contract`);
    assert.strictEqual(contract.status, 'contract');
    assert.ok(contract.source);
    assert.ok(contract.evidence);
    assert.ok(contract.method);
    assert.ok(contract.identity);
    assert.ok(contract.requiredUserInput);
    assert.ok(contract.replay);
    assert.strictEqual(contract.requiredUserInput.status, expected[taskType].inputStatus);
    assert.deepStrictEqual(contract.requiredUserInput.fields, []);
  }
  assert.strictEqual(SERVER_VERIFIED_CONTRACTS.game.source, 'mini_app_backend');
  assert.strictEqual(SERVER_VERIFIED_CONTRACTS.game.identity, 'telegram_init_data_user_correlation');
  assert.strictEqual(SERVER_VERIFIED_CONTRACTS.social.identity, 'authenticated_user_correlation');
  assert.strictEqual(SERVER_VERIFIED_CONTRACTS.web.evidence, 'signed_webhook_or_unique_token');
  assert.strictEqual(SERVER_VERIFIED_CONTRACTS.special.evidence, 'signed_or_hmac_evidence');
}

function testReferralModes() {
  assert.deepStrictEqual(REFERRAL_MODES, ['disabled', 'link_only', 'link_and_owner_verification']);
  assert.strictEqual(resolveVerificationConfig({ taskType: 'web', config: {} }).referral.mode, 'disabled');
  assert.strictEqual(resolveVerificationConfig({ taskType: 'social', config: { referral: { mode: 'link_only', referralUrlTemplate: 'https://example.test/register?ref={code}' } } }).referral.mode, 'link_only');
  assert.strictEqual(resolveVerificationConfig({ taskType: 'social', config: { referral: { mode: 'link_and_owner_verification', referralUrlTemplate: 'https://example.test/register?ref={code}', ownerVerification: { provider: 'partner' } } } }).referral.mode, 'link_and_owner_verification');
}

function testAutomaticDefaults() {
  const ads = resolveVerificationConfig({ taskType: 'daily', config: { verification: { provider: 'ads' } } });
  assert.strictEqual(ads.verification.mode, 'automatic');
  assert.strictEqual(ads.verification.provider, 'ads');
}

function testReferralTemplateRules() {
  assert.throws(() => validateVerificationConfig({ referral: { mode: 'link_only' } }), /referralUrlTemplate is required/);
  assert.throws(() => validateVerificationConfig({ referral: { mode: 'link_and_owner_verification', referralUrlTemplate: 'https://example.test/register' } }), /owner verification configuration is required/);
}

function testNoSecretsInTaskConfig() {
  assert.throws(() => validateVerificationConfig({ verification: { apiKey: 'secret' } }), /credentials must not be stored in task config/);
  assert.throws(() => validateVerificationConfig({ referral: { ownerVerification: { provider: 'partner', credentials: { token: 'secret' } } } }), /credentials must not be stored in task config/);
}

function testTelegramChannelResolution() {
  const resolved = resolveVerificationConfig({ taskType: 'social', config: { verification: { provider: 'telegram_channel', channel: '@creator_channel' } } });
  assert.strictEqual(resolved.verification.provider, 'telegram_channel');
  assert.strictEqual(resolved.verification.channel, '@creator_channel');
}

try {
  testVerificationModes();
  testCompletionModes();
  testSpecialServerVerifiedOnly();
  testServerVerifiedContracts();
  testReferralModes();
  testAutomaticDefaults();
  testReferralTemplateRules();
  testNoSecretsInTaskConfig();
  testTelegramChannelResolution();
  console.log('Task verification configuration invariants: PASS');
} catch (error) {
  console.error('Task verification configuration invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
