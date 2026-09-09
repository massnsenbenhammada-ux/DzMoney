const assert = require('assert');
const crypto = require('crypto');
const { pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { createMonetagProvider } = require('../src/services/monetag-adapter');
const {
  startTaskAdvertisement,
} = require('../src/services/task-advertisement-service');
const { getSystemTask } = require('../src/services/daily-system-task-service');

const CONCURRENCY = 50;
const P95_LIMIT_MS = 1000;

async function main() {
  if (!process.env.TEST_TELEGRAM_USER_ID)
    throw new Error('TEST_TELEGRAM_USER_ID is required');
  const user = await walletService.createUser({
    telegramUserId: `${process.env.TEST_TELEGRAM_USER_ID}${Date.now()}`.slice(
      0,
      15,
    ),
    username: `phase14_load_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    firstName: 'Phase 14 Load',
  });
  const task = await getSystemTask('view_ads');
  const registry = new AdProviderRegistry([createMonetagProvider()]);
  try {
    const startedAt = process.hrtime.bigint();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, index) =>
        (async () => {
          const requestStartedAt = process.hrtime.bigint();
          const result = await startTaskAdvertisement({
            userId: user.id,
            taskId: task.id,
            idempotencyKey: `phase14-load-${user.id}-${index}-${crypto.randomUUID()}`,
            providerRegistry: registry,
          });
          return {
            result,
            elapsedMs: Number(process.hrtime.bigint() - requestStartedAt) / 1e6,
          };
        })(),
      ),
    );
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    assert.strictEqual(results.length, CONCURRENCY);
    assert(results.every(({ result }) => result.providerId === 'monetag'));
    const samples = results
      .map(({ elapsedMs: duration }) => duration)
      .sort((a, b) => a - b);
    const p95 =
      samples[
        Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)
      ];
    assert(
      p95 <= P95_LIMIT_MS,
      `Daily View advertisement start p95 ${p95.toFixed(2)}ms exceeds ${P95_LIMIT_MS}ms`,
    );
    console.log(
      `Phase 14 Daily View Ads load: PASS (${CONCURRENCY} concurrent starts, p95=${p95.toFixed(2)}ms, total=${elapsedMs.toFixed(2)}ms)`,
    );
  } finally {
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [
      user.id,
    ]);
    await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Phase 14 Daily View Ads load: FAIL');
  console.error(error);
  process.exit(1);
});
