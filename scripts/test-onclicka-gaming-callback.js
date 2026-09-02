'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { pool } = require('../src/db/pool');
const gamingService = require('../src/services/gaming-service');
const { createOnclickaProvider } = require('../src/services/onclicka-adapter');
const { createOnclickaPostbackRouter } = require('../src/http/onclicka-postback-routes');

async function request(app, path) {
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

async function testGamingCallbackCorrelatesPendingEvent() {
  const marker = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const telegramUserId = marker.slice(0, 18);
  const userResult = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [telegramUserId, `onclicka_${marker}`, 'OnClickA Test']
  );
  const userId = userResult.rows[0].id;
  const originalFinalize = gamingService.finalizeGamingAdvertisement;
  let finalizeArgs;

  try {
    const configResult = await pool.query('SELECT version FROM gaming_config_versions ORDER BY version DESC LIMIT 1');
    assert.strictEqual(configResult.rowCount, 1);
    const eventResult = await pool.query(
      `INSERT INTO activity_ad_events
        (user_id,context,external_ad_id,idempotency_key,started_at,metadata)
       VALUES ($1,'gaming',$2,$3,NOW(),$4)
       RETURNING id`,
      [
        userId,
        `onclicka-test-${marker}`,
        `onclicka-gaming-${marker}`,
        { game: 'spin', provider_id: 'onclicka', config_version: configResult.rows[0].version }
      ]
    );
    const adEventId = eventResult.rows[0].id;

    gamingService.finalizeGamingAdvertisement = async args => {
      finalizeArgs = args;
      return { duplicate: false, rewarded: true, resourceGranted: 'spin', progress: 1 };
    };

    const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
    const providerRegistry = {
      get: providerId => providerId === 'onclicka' ? provider : null,
      isContextEnabled: (providerId, context) => providerId === 'onclicka' && context === 'gaming',
      listAvailable: context => context === 'gaming' ? [provider] : []
    };
    const app = express();
    app.use('/api/ads/onclicka', createOnclickaPostbackRouter({ providerRegistry }));
    const response = await request(app, `/api/ads/onclicka?USERID=${telegramUserId}`);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(JSON.parse(response.body), {
      ok: true, context: 'gaming', verified: true, duplicate: false,
      rewarded: true, resourceGranted: 'spin', progress: 1
    });
    assert.deepStrictEqual(finalizeArgs, {
      userId,
      adEventId,
      providerReference: `onclicka:6134799:${telegramUserId}`,
      verificationMetadata: {
        provider_id: 'onclicka',
        spot_id: '6134799',
        telegram_user_id: telegramUserId,
        postbackConfirmed: true
      }
    });
  } finally {
    gamingService.finalizeGamingAdvertisement = originalFinalize;
    await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
  }
}

async function main() {
  try {
    await testGamingCallbackCorrelatesPendingEvent();
    console.log('OnClickA Gaming callback integration: PASS');
  } catch (error) {
    console.error('OnClickA Gaming callback integration: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
