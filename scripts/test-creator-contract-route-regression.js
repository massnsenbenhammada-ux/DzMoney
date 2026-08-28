const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const routeSource = fs.readFileSync('src/http/creator-task-routes.js', 'utf8');

assert.match(
  routeSource,
  /getCreatorCampaignContract\(\)/,
  'Creator contract route must call getCreatorCampaignContract without taskType'
);

assert.doesNotMatch(
  routeSource,
  /getCreatorCampaignContract\(taskType\)/,
  'Creator contract route must not pass taskType as queryFn'
);

const serviceSource = fs.readFileSync('src/services/task-service.js', 'utf8');
const sandbox = { module: { exports: {} }, exports: {}, require, console };
vm.runInNewContext(`${serviceSource}\nmodule.exports = { getCreatorCampaignContract };`, sandbox);

const calls = [];
const result = sandbox.module.exports.getCreatorCampaignContract(async (text, params) => {
  calls.push({ text, params });
  return { rows: [{ key: 'task.campaign_price_dzx_per_execution', value: '10' }] };
});

assert.ok(result instanceof Promise);
result.then(contract => {
  assert.equal(contract.priceDZX, 10);
  assert.equal(calls.length, 1);
  console.log('Creator contract route regression test passed.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
