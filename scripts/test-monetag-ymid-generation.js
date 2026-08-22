const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { startDailyCheckinClaim } = require('../src/services/daily-checkin-service');

const provider = {
  id: 'test-monetag-ymid',
  contexts: ['daily_checkin'],
  async verifyCompletion() {
    return { verified: false };
  }
};

const registry = new AdProviderRegistry([provider]);

async function createUser() {
  const marker = `${Date.now()}-${Math.random()}`;
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [marker, `ymid_${Date.now()}`, 'YMID Test']
  );
  return result.rows[0].id;
}

async function cleanup(userId) {
  await withTransaction(async client => {
    await client.query('DELETE FROM daily_checkins WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function main() {
  const userId = await createUser();
  const idempotencyKey = `ymid-${Date.now()}`;
  try {
    const claim = await startDailyCheckinClaim({
      userId,
      idempotencyKey,
      externalAdId: 'client-controlled-ymid',
      providerRegistry: registry
    });

    assert.match(claim.adEvent.external_ad_id, /^[A-Za-z0-9_-]{16,}$/);
    assert.notStrictEqual(claim.adEvent.external_ad_id, 'client-controlled-ymid');

    const duplicate = await startDailyCheckinClaim({
      userId,
      idempotencyKey,
      externalAdId: 'different-client-ymid',
      providerRegistry: registry
    });

    assert.strictEqual(duplicate.adEvent.id, claim.adEvent.id);
    assert.strictEqual(duplicate.adEvent.external_ad_id, claim.adEvent.external_ad_id);

    console.log('Monetag YMID generation invariants: PASS');
  } finally {
    await cleanup(userId);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Monetag YMID generation invariants: FAIL');
  console.error(error);
  process.exit(1);
});
