const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const { resolveVerificationConfig } = require('../services/task-verification-config');
const { query: defaultQuery } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');

const CREATOR_TASK_TYPES = ['game', 'social', 'web'];
const CREATOR_MIN_TARGET = 1000;
const CONTRACT_DESCRIPTIONS = Object.freeze({
  open_link: 'Use this when opening the configured link is itself the outcome you want to reward. It does not prove a deeper external action.',
  server_verified: 'Use this when the requested external outcome must be confirmed by trusted server-verifiable evidence.'
});

function requireTaskType(taskType) {
  if (!CREATOR_TASK_TYPES.includes(taskType)) {
    const error = new Error('Invalid creator task type');
    error.statusCode = 400;
    throw error;
  }
  return taskType;
}

async function getAdminNumber(query, key, fallback = null) {
  const result = await query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) ? value : fallback;
}

async function getCampaignContractPricing(query) {
  const priceDZXPerExecution = await getAdminNumber(query, 'task.campaign_price_dzx_per_execution');
  return { minTarget: CREATOR_MIN_TARGET, priceDZXPerExecution };
}

async function getCreatorActivityRewards(query) {
  const rows = await query(
    `SELECT key, value FROM admin_settings WHERE key = ANY($1::text[])`,
    [['activity.reward_coin', 'activity.reward_dzx', 'activity.reward_dzp']]
  );
  const values = Object.fromEntries(rows.rows.map(row => [row.key, Number(row.value)]));
  return {
    coin: Number.isFinite(values['activity.reward_coin']) ? values['activity.reward_coin'] : 1000,
    dzx: Number.isFinite(values['activity.reward_dzx']) ? values['activity.reward_dzx'] : 1,
    dzp: Number.isFinite(values['activity.reward_dzp']) ? values['activity.reward_dzp'] : 1
  };
}

async function contractFor(taskType, query) {
  requireTaskType(taskType);
  const serverVerified = resolveVerificationConfig({ taskType, config: {} }).serverVerified;
  const availableCompletionModes = ['open_link', 'server_verified'];
  return {
    taskType,
    availableCompletionModes,
    completionServices: availableCompletionModes.map(mode => ({ mode, description: CONTRACT_DESCRIPTIONS[mode] })),
    serverVerified,
    creatorInput: serverVerified.requiredUserInput,
    campaignPricing: await getCampaignContractPricing(query)
  };
}

function validateCreatorCompletion(config) {
  const completion = config?.completion || {};
  if (!completion.url) {
    const error = new Error('completion.url is required for creator campaigns');
    error.statusCode = 400;
    throw error;
  }
}

function createCreatorTaskRouter({ wallet = walletService, tasks = taskService, auth = telegramAuth, query = defaultQuery } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);

  router.get('/contracts/:taskType', asyncRoute(async (req, res) => {
    res.json(await contractFor(req.params.taskType, query));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const taskType = req.body?.taskType;
    requireTaskType(taskType);
    if (!req.body?.title) return res.status(400).json({ ok: false, error: 'title is required' });
    if (!req.body?.idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    if (!Number.isInteger(req.body?.target) || req.body.target < CREATOR_MIN_TARGET) return res.status(400).json({ ok: false, error: `target must be at least ${CREATOR_MIN_TARGET}` });
    validateCreatorCompletion(req.body.config);

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const rewards = await getCreatorActivityRewards(query);
    const result = await tasks.createCreatorCampaign({
      taskType,
      title: req.body.title,
      description: req.body.description || null,
      creatorId: user.id,
      target: req.body.target,
      rewardCoin: rewards.coin,
      rewardDzx: rewards.dzx,
      rewardDzp: rewards.dzp,
      config: req.body.config || {},
      idempotencyKey: req.body.idempotencyKey
    });

    res.status(201).json({
      ok: true,
      task: result.task,
      campaign: {
        appliedPriceDZX: result.appliedPriceDZX,
        campaignCostDZX: result.campaignCostDZX,
        duplicate: result.duplicate
      },
      contract: await contractFor(taskType, query)
    });
  }));

  router.post('/:taskId/submit', asyncRoute(async (req, res) => {
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const task = await tasks.submitCreatorCampaignForReview(req.params.taskId, user.id);
    res.json({ ok: true, task });
  }));

  return router;
}

module.exports = { CREATOR_TASK_TYPES, CREATOR_MIN_TARGET, CONTRACT_DESCRIPTIONS, createCreatorTaskRouter };
