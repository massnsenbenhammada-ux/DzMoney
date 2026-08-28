'use strict';

const assert = require('node:assert/strict');
const { getCreatorCampaignContract } = require('../src/services/task-service');

const queryWith = rows => async () => ({ rows });

async function run() {
  const configured = await getCreatorCampaignContract(queryWith([
    { key: 'task.campaign_price_dzx_per_execution', value: '10' },
    { key: 'verification_ad_seconds', value: '30' }
  ]));
  assert.equal(configured.priceDZX, 10);

  await assert.rejects(
    () => getCreatorCampaignContract(queryWith([{ key: 'verification_ad_seconds', value: '30' }])),
    /Creator campaign price setting is not configured/
  );

  await assert.rejects(
    () => getCreatorCampaignContract(queryWith([{ key: 'task.campaign_price_dzx_per_execution', value: '0' }])),
    /Creator campaign price setting must be a positive finite number/
  );

  await assert.rejects(
    () => getCreatorCampaignContract(queryWith([{ key: 'task.campaign_price_dzx_per_execution', value: 'not-a-number' }])),
    /Creator campaign price setting must be a positive finite number/
  );

  console.log('creator campaign pricing configuration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
