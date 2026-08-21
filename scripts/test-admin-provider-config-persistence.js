const assert = require('assert');
const { pool } = require('../src/db/pool');
const { saveProviderConfiguration, loadProviderConfigurations } = require('../src/services/admin-provider-config-service');

async function main() {
  const key = 'ads.providers.test';
  const config = [{
    providerId: 'adsgram',
    enabled: true,
    priority: 1,
    contexts: ['verification'],
    timeoutMs: 5000,
  }];

  try {
    await saveProviderConfiguration({ key, configurations: config, registeredProviderIds: ['adsgram'], actorTelegramUserId: 1 });
    const loaded = await loadProviderConfigurations(key);
    assert.deepStrictEqual(loaded, config);

    const audit = await pool.query(
      'SELECT old_value, new_value, actor_telegram_user_id FROM admin_audit_log WHERE setting_key = $1 ORDER BY id DESC LIMIT 1',
      [key]
    );
    assert.strictEqual(audit.rows[0].actor_telegram_user_id, '1');
    assert.deepStrictEqual(audit.rows[0].new_value, config);

    console.log('Admin provider configuration persistence: PASS');
  } catch (error) {
    console.error('Admin provider configuration persistence: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.query('DELETE FROM admin_audit_log WHERE setting_key = $1', [key]);
    await pool.query('DELETE FROM admin_settings WHERE key = $1', [key]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Admin provider persistence test runner: FAIL');
  console.error(error);
  process.exit(1);
});
