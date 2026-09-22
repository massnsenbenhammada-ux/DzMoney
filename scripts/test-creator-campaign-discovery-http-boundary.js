'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const http = require('http');

process.env.BOT_TOKEN = 'creator-campaign-reachability-test-token';

function buildInitData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

function request(server, method, path, body, initData) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const req = http.request({ port: server.address().port, method, path, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const { createTaskRouter } = require('../src/http/task-routes');
  const { createCreatorTaskRouter } = require('../src/http/creator-task-routes');

  const app = express();
  app.use(express.json());

  const activeCampaign = {
    id: 901,
    taskType: 'social',
    title: 'Creator campaign',
    description: 'Complete the campaign',
    rewardCoin: 1000,
    rewardDzx: 1,
    rewardDzp: 1,
    verificationAdSeconds: 5,
    campaignUrl: 'https://example.test/campaign',
    verification: { provider: null, providerConfigRef: null, method: 'click_proof', event: null, channel: null, requirements: {} },
    target: 1000,
    verifiedCount: 12,
    remainingExecutions: 988,
    isCreatorCampaign: true
  };

  const creatorCampaign = {
    ...activeCampaign,
    status: 'active',
    campaignCostDZX: 10000,
    appliedPriceDZX: 10,
    refund: null,
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z'
  };

  const wallet = {
    createUser: async args => ({ id: args.telegramUserId === '1002' ? 202 : 101, ...args })
  };
  const tasks = {
    listActiveTasks: async () => [],
    listActiveCreatorCampaigns: async () => [activeCampaign],
    listCreatorCampaigns: async ({ creatorId }) => creatorId === 101 ? [creatorCampaign] : [],
    getCreatorCampaign: async ({ creatorId, taskId }) => creatorId === 101 && taskId === 901 ? creatorCampaign : null
  };

  app.use('/api/tasks', createTaskRouter({ tasks, wallet, verification: {}, advertisement: {}, providerRegistry: {} }));
  app.use('/api/creator/tasks', createCreatorTaskRouter({ tasks, wallet }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ ok: false, error: error.message }));

  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });

  try {
    assert.equal((await request(server, 'GET', '/api/tasks/creator', null)).status, 401);

    const auth = buildInitData(1001);
    const discovery = await request(server, 'GET', '/api/tasks/creator', null, auth);
    assert.equal(discovery.status, 200);
    assert.deepEqual(discovery.body.tasks, [activeCampaign]);
    assert.equal(discovery.body.tasks[0].isCreatorCampaign, true);
    assert.equal(discovery.body.tasks[0].remainingExecutions, 988);

    const creatorList = await request(server, 'GET', '/api/creator/tasks', null, auth);
    assert.equal(creatorList.status, 200);
    assert.deepEqual(creatorList.body.campaigns, [creatorCampaign]);

    const creatorDetail = await request(server, 'GET', '/api/creator/tasks/901', null, auth);
    assert.equal(creatorDetail.status, 200);
    assert.equal(creatorDetail.body.campaign.id, 901);
    assert.equal(creatorDetail.body.campaign.verifiedCount, 12);

    const foreignAuth = buildInitData(1002);
    const foreignDetail = await request(server, 'GET', '/api/creator/tasks/901', null, foreignAuth);
    assert.equal(foreignDetail.status, 404);

    console.log('creator campaign discovery/read HTTP boundary: PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error('creator campaign discovery/read HTTP boundary: FAIL');
  console.error(error);
  process.exitCode = 1;
});
