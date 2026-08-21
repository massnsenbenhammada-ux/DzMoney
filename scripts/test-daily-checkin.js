const assert = require('assert');
const { createDailyCheckinService } = require('../src/services/daily-checkin-service');

function createHarness() {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }
  };
  return { db, calls };
}

async function run() {
  const { db } = createHarness();
  const service = createDailyCheckinService({ db });

  assert.throws(
    () => service,
    /cannot claim/i,
    'Claim must require verified advertisement state'
  );

  const verified = await service.claim({
    userId: 1,
    adEventId: 10,
    idempotencyKey: 'daily-1'
  });

  assert.strictEqual(verified.context, 'daily_checkin');
  assert.strictEqual(verified.reward, 'daily_checkin');

  console.log('Daily check-in service invariants: PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
