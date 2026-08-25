const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const { COMPLETION_MODES, CREATOR_CAMPAIGN_TYPES, resolveVerificationConfig } = require('../services/task-verification-config');
const { telegramAuth } = require('./telegram-auth');

const CREATOR_TASK_TYPES = ['game', 'social', 'web'];
const CONTRACT_DESCRIPTIONS = Object.freeze({
  open_link: 'Use this when opening the configured link is itself the outcome you want to reward. It does not prove a deeper external action.',
  server_verified: 'Use this when the requested external outcome must be confirmed by trusted server-verifiable evidence.'
});

function requireTaskType(taskType) {
  if (!CREATOR_TASK_TYPES.includes(taskType) && taskType !== 'special') {
    const error = new Error('Invalid creator task type');
    error.statusCode = 400;
    throw error;
  }
  return taskType;
}

function contractFor(taskType) {
  requireTaskType(taskType);
  const serverVerified = resolveVerificationConfig({ taskType, config: {} }).serverVerified;
  const availableCompletionModes = taskType === 'special' ? ['server_verified'] : ['open_link', 'server_verified'];
  return {
    taskType,
    availableCompletionModes,
    completionServices: availableCompletionModes.map(mode => ({ mode, description: CONTRACT_DESCRIPTIONS[mode] })),
    serverVerified,
    creatorInput: serverVerified.requiredUserInput,
    specialPartnerRestriction: taskType === 'special' ? 'server_verified_only' : null
  };
}

function createCreatorTaskRouter({ wallet = walletService, tasks = taskService, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);

  router.get('/contracts/:taskType', asyncRoute(async (req, res) => {
    res.json(contractFor(req.params.taskType));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const taskType = req.body?.taskType;
    requireTaskType(taskType);
    if (!req.body?.title) return res.status(400).json({ ok: false, error: 'title is required' });
    if (!req.body?.idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const result = await tasks.createCreatorCampaign({
      taskType,
      title: req.body.title,
      description: req.body.description || null,
      creatorId: user.id,
      target: req.body.target,
      rewardCoin: req.body.rewardCoin,
      rewardDzx: req.body.rewardDzx,
      rewardDzp: req.body.rewardDzp,
      verificationAdSeconds: req.body.verificationAdSeconds,
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
      contract: contractFor(taskType)
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

module.exports = { CREATOR_TASK_TYPES, CONTRACT_DESCRIPTIONS, createCreatorTaskRouter };
