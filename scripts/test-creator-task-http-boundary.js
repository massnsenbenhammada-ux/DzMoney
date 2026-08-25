const assert = require('assert');
const crypto = require('crypto');
const express = require('express');

process.env.BOT_TOKEN = 'test-bot-token';

function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: userId, first_name: 'Creator' }));
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

async function run() {
  const { createCreatorTaskRouter } = require('../src/http/creator-task-routes');
  const calls = [];
  const walletCalls = [];
  const wallet = { createUser: async args => { walletCalls.push(args); return { id: 42, ...args }; } };
  const tasks = {
    createCreatorCampaign: async args => { calls.push({ create: args }); return { task: { id: 7, task_type: args.taskType, config: args.config }, appliedPriceDZX: 9, campaignCostDZX: 9000, duplicate: false }; },
    submitCreatorCampaignForReview: async (taskId, creatorId) => { calls.push({ submit: { taskId, creatorId } }); return { id: 7, status: 'pending_review', creator_id: creatorId }; }
  };
  const query = async (sql, params) => {
    if (sql.includes('key = ANY')) return { rows: [
      { key: 'activity.default_reward_coin', value: 1000 },
      { key: 'activity.default_reward_dzx', value: 1 },
      { key: 'activity.default_reward_dzp', value: 1 }
    ], rowCount: 3 };
    if (params?.[0] === 'task.campaign_price_dzx_per_execution') return { rows: [{ value: 9 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/creator/tasks', createCreatorTaskRouter({ wallet, tasks, query }));
  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(status).json({ ok: false, error: status === 500 ? 'Internal server error' : error.message });
  });
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const request = (method, path, body, initData) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  assert.strictEqual((await request('GET', '/api/creator/tasks/contracts/special')).status, 401);
  const auth = buildInitData(123);

  const specialContract = await request('GET', '/api/creator/tasks/contracts/special', null, auth);
  assert.strictEqual(specialContract.status, 400);

  const socialContract = await request('GET', '/api/creator/tasks/contracts/social', null, auth);
  assert.deepStrictEqual(socialContract.body.availableCompletionModes, ['open_link', 'server_verified']);
  assert.strictEqual(socialContract.body.creatorInput.status, 'provider_contract_required');
  assert.strictEqual(socialContract.body.campaignPricing.minTarget, 1000);
  assert.strictEqual(socialContract.body.campaignPricing.targetStep, 1000);
  assert.strictEqual(socialContract.body.campaignPricing.priceDZXPerExecution, 9);

  const create = await request('POST', '/api/creator/tasks', {
    taskType: 'social',
    title: 'Telegram test campaign',
    target: 1000,
    rewardCoin: 999999,
    rewardDzx: 999,
    rewardDzp: 999,
    verificationAdSeconds: 10,
    idempotencyKey: 'creator-task-1',
    config: { completion: { mode: 'server_verified', url: 'https://example.test/campaign' } }
  }, auth);
  assert.strictEqual(create.status, 201);
  assert.strictEqual(create.body.task.id, 7);
  assert.strictEqual(walletCalls[0].telegramUserId, '123');
  assert.strictEqual(calls[0].create.creatorId, 42);
  assert.strictEqual(calls[0].create.config.completion.mode, 'server_verified');
  assert.strictEqual(calls[0].create.config.completion.url, 'https://example.test/campaign');
  assert.strictEqual(calls[0].create.target, 1000);
  assert.strictEqual(calls[0].create.rewardCoin, 1000);
  assert.strictEqual(calls[0].create.rewardDzx, 1);
  assert.strictEqual(calls[0].create.rewardDzp, 1);
  assert.strictEqual(calls[0].create.verificationAdSeconds, undefined);

  const missingUrl = await request('POST', '/api/creator/tasks', {
    taskType: 'social', title: 'Missing URL', target: 1000, idempotencyKey: 'creator-task-2', config: { completion: { mode: 'server_verified' } }
  }, auth);
  assert.strictEqual(missingUrl.status, 400);

  const tooSmall = await request('POST', '/api/creator/tasks', {
    taskType: 'social', title: 'Too small', target: 999, idempotencyKey: 'creator-task-3', config: { completion: { mode: 'open_link', url: 'https://example.test' } }
  }, auth);
  assert.strictEqual(tooSmall.status, 400);

  const invalidStep = await request('POST', '/api/creator/tasks', {
    taskType: 'social', title: 'Invalid step', target: 1500, idempotencyKey: 'creator-task-4', config: { completion: { mode: 'open_link', url: 'https://example.test' } }
  }, auth);
  assert.strictEqual(invalidStep.status, 400);

  const submit = await request('POST', '/api/creator/tasks/7/submit', {}, auth);
  assert.strictEqual(submit.status, 200);
  assert.strictEqual(submit.body.task.status, 'pending_review');
  assert.strictEqual(calls[1].submit.creatorId, 42);
  assert.strictEqual(calls[1].submit.taskId, '7');

  const invalidType = await request('GET', '/api/creator/tasks/contracts/daily', null, auth);
  assert.strictEqual(invalidType.status, 400);

  await new Promise(resolve => server.close(resolve));
  console.log('creator-task HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
