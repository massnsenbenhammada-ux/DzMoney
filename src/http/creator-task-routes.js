const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const { telegramAuth } = require('./telegram-auth');

const CREATOR_TASK_TYPES = ['game', 'social', 'web'];
const CREATOR_MIN_TARGET = 1000;
const CREATOR_TARGET_STEP = 1000;
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

function validateCreatorCompletion(config) {
  const completion = config?.completion || {};
  if (!completion.url) {
    const error = new Error('completion.url is required for creator campaigns');
    error.statusCode = 400;
    throw error;
  }
}

async function contractFor(tasks, taskType) {
  requireTaskType(taskType);
  const contract = await tasks.getCreatorCampaignContract(taskType);
  const availableCompletionModes = contract.availableCompletionModes || [];
  return {
    ...contract,
    completionServices: availableCompletionModes.map(mode => ({ mode, description: CONTRACT_DESCRIPTIONS[mode] })),
    campaignPricing: {
      minTarget: CREATOR_MIN_TARGET,
      targetStep: CREATOR_TARGET_STEP,
      priceDZXPerExecution: contract.priceDZX
    }
  };
}

function createCreatorTaskRouter({ wallet = walletService, tasks = taskService, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);

  router.get('/contracts/:taskType', asyncRoute(async (req, res) => {
    res.json(await contractFor(tasks, req.params.taskType));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const taskType = req.body?.taskType;
    requireTaskType(taskType);
    if (!req.body?.title) return res.status(400).json({ ok: false, error: 'title is required' });
    if (!req.body?.idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    if (!Number.isInteger(req.body?.target) || req.body.target < CREATOR_MIN_TARGET || req.body.target % CREATOR_TARGET_STEP !== 0) return res.status(400).json({ ok: false, error: `target must be a multiple of ${CREATOR_TARGET_STEP} and at least ${CREATOR_MIN_TARGET}` });
    validateCreatorCompletion(req.body.config);

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const rewards = await tasks.getCreatorActivityRewards();
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
      contract: await contractFor(tasks, taskType)
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

module.exports = { CREATOR_TASK_TYPES, CREATOR_MIN_TARGET, CREATOR_TARGET_STEP, CONTRACT_DESCRIPTIONS, createCreatorTaskRouter };
