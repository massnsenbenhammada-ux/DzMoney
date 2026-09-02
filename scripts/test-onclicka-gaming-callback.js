'use strict';

process.env.ONCLICKA_ENABLED = 'true';
process.env.ONCLICKA_SPOT_ID = process.env.ONCLICKA_SPOT_ID || '6134799';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { pool, query } = require('../src/db/pool');
const gamingService = require('../src/services/gaming-service');
const providerRegistry = require('../src/services/ad-provider-registry-runtime');
const { ONCLICKA_PROVIDER_ID } = require('../src/services/onclicka-adapter');
const { createOnclickaPostbackRouter } = require('../src/http/onclicka-postback-routes');

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.get({ hostname: '127.0.0.1', port, path }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
      });
      req.on('error', error => server.close(() => reject(error)));
    });
    server.on('error', reject);
  });
}

async function createUser(marker) {
  const result = await query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id,telegram_user_id',
    [marker, `onclicka_${marker}`, 'OnClickA Test']
  );
  return result.rows[0];
}

async function createEvent(userId, metadata, suffix = '') {
  const result = await query(
    `INSERT INTO activity_ad_events
      (user_id,context,external_ad_id,idempotency_key,started_at,metadata)
     VALUES ($1,'gaming',$2,$3,NOW(),$4)
     RETURNING *`,
    [userId, `onclicka-test-${userId}-${suffix || Date.now()}`, `onclicka-gaming-${userId}-${suffix || Date.now()}`, metadata]
  );
  return result.rows[0];
}

async function getAccount(userId) {
  const result = await query('SELECT spins,axes,spin_ad_progress,digging_ad_progress FROM gaming_accounts WHERE user_id=$1', [userId]);
  return result.rows[0] || null;
}

async function cleanupUser(userId) {
  await query('DELETE FROM users WHERE id=$1', [userId]);
}

async function testHappyPathAndDuplicate(app) {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const user = await createUser(marker);
  try {
    const started = await gamingService.startGamingAdvertisement({
      userId: user.id,
      game: 'spin',
      idempotencyKey: `onclicka-integration:${marker}`,
      providerRegistry
    });
    assert.strictEqual(started.providerId, ONCLICKA_PROVIDER_ID);
    const before = await getAccount(user.id);
    assert(before);

    const response = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(response.status, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.context, 'gaming');
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.resourceGranted, 'spin');
    assert.strictEqual(body.progress, before.spin_ad_progress + 1);

    const after = await getAccount(user.id);
    assert.strictEqual(after.spins, before.spins + 1);
    assert.strictEqual(after.spin_ad_progress, before.spin_ad_progress + 1);

    const duplicate = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(duplicate.status, 404);
    const afterDuplicate = await getAccount(user.id);
    assert.deepStrictEqual(afterDuplicate, after);

    const directDuplicate = await gamingService.finalizeGamingAdvertisement({
      userId: user.id,
      adEventId: started.adEvent.id,
      providerReference: `onclicka:${marker}`,
      verificationMetadata: { provider_id: ONCLICKA_PROVIDER_ID, confirmedByPostback: true }
    });
    assert.strictEqual(directDuplicate.duplicate, true);
    assert.strictEqual(directDuplicate.rewarded, true);
  } finally {
    await cleanupUser(user.id);
  }
}

async function testMissingUser(app) {
  const response = await request(app, '/api/ads/onclicka');
  assert.strictEqual(response.status, 400);
}

async function testUnknownUser(app) {
  const response = await request(app, '/api/ads/onclicka?USERID=999999999999999999');
  assert.strictEqual(response.status, 404);
}

async function testNoPendingEvent(app) {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const user = await createUser(marker);
  try {
    const response = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(response.status, 404);
  } finally {
    await cleanupUser(user.id);
  }
}

async function testMultiplePendingEvents(app) {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const user = await createUser(marker);
  try {
    const metadata = { game: 'spin', provider_id: ONCLICKA_PROVIDER_ID, config_version: 1 };
    await createEvent(user.id, metadata, 'one');
    await createEvent(user.id, metadata, 'two');
    const response = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(response.status, 409);
  } finally {
    await cleanupUser(user.id);
  }
}

async function testWrongProvider(app) {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const user = await createUser(marker);
  try {
    await createEvent(user.id, { game: 'spin', provider_id: 'monetag', config_version: 1 }, 'wrong-provider');
    const response = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(response.status, 404);
  } finally {
    await cleanupUser(user.id);
  }
}

async function testWrongContext(app) {
  const response = await request(app, '/api/ads/onclicka/not-a-context?USERID=12345');
  assert.strictEqual(response.status, 404);
}

async function testLateCallback(app) {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const user = await createUser(marker);
  try {
    const event = await createEvent(user.id, { game: 'spin', provider_id: ONCLICKA_PROVIDER_ID, config_version: 1 }, 'late');
    await query('UPDATE activity_ad_events SET verified=TRUE,completed_at=NOW() WHERE id=$1', [event.id]);
    const response = await request(app, `/api/ads/onclicka?USERID=${marker}`);
    assert.strictEqual(response.status, 404);
  } finally {
    await cleanupUser(user.id);
  }
}

async function main() {
  const app = express();
  app.use('/api/ads/onclicka', createOnclickaPostbackRouter({ providerRegistry }));
  try {
    assert(providerRegistry.get(ONCLICKA_PROVIDER_ID));
    assert.strictEqual(providerRegistry.listAvailable('gaming')[0].id, ONCLICKA_PROVIDER_ID);
    await testHappyPathAndDuplicate(app);
    await testMissingUser(app);
    await testUnknownUser(app);
    await testNoPendingEvent(app);
    await testMultiplePendingEvents(app);
    await testWrongProvider(app);
    await testWrongContext(app);
    await testLateCallback(app);
    console.log('OnClickA Gaming callback integration: PASS (valid, missing USERID, unknown user, no pending, multiple pending, duplicate, late, idempotency, wrong provider, wrong context)');
  } catch (error) {
    console.error('OnClickA Gaming callback integration: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
