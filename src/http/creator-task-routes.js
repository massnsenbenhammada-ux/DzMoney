const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const { telegramAuth } = require('./telegram-auth');
const { createStrictObjectValidator, createValidationMiddleware } = require('./input-validation');
const { getCreatorProviderContracts, validateCreatorProviderConfiguration } = require('../services/task-verification-config');

const CREATOR_TASK_TYPES = ['game', 'social', 'web'];
const CREATOR_MIN_TARGET = 1000;
const CREATOR_TARGET_STEP = 1;
const SOCIAL_CPM_DZX = Object.freeze({ open_link: 5000, server_verified: 9000 });
const CONTRACT_DESCRIPTIONS = Object.freeze({
  open_link: 'Open the configured Telegram target link. DzMoney proves the click only; it does not prove subscription.',
  server_verified: 'Telegram Bot API verifies the requested Telegram membership server-side.'
});

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const isCreatorTaskType = value => CREATOR_TASK_TYPES.includes(value);
const isValidTarget = value => Number.isInteger(value) && value >= CREATOR_MIN_TARGET;
const isOptionalNonNegativeInteger = value => value === undefined || value === null || (Number.isInteger(value) && value >= 0);
const isCreatorConfig = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const completion = value.completion;
  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) return false;
  if (completion.mode === 'open_link') return isNonEmptyString(completion.url) && isNonEmptyString(completion.telegramTarget);
  if (completion.mode === 'server_verified') return isNonEmptyString(completion.telegramTarget);
  return isNonEmptyString(completion.url);
};

const validateCreatorTaskBody = createStrictObjectValidator({
  taskType: isCreatorTaskType,
  title: isNonEmptyString,
  description: { validate: value => value === undefined || value === null || typeof value === 'string' },
  target: isValidTarget,
  rewardCoin: { validate: isOptionalNonNegativeInteger },
  rewardDzx: { validate: isOptionalNonNegativeInteger },
  rewardDzp: { validate: isOptionalNonNegativeInteger },
  verificationAdSeconds: { validate: isOptionalNonNegativeInteger },
  config: { validate: isCreatorConfig },
  idempotencyKey: isNonEmptyString
});

function requireTaskType(taskType) {
  if (!CREATOR_TASK_TYPES.includes(taskType)) {
    const error = new Error('Invalid creator task type');
    error.statusCode = 400;
    throw error;
  }
  return taskType;
}

function validateCreatorProvider(taskType, config) {
  try {
    validateCreatorProviderConfiguration(taskType, config);
  } catch (error) {
    if (!Number.isInteger(error.statusCode)) error.statusCode = 400;
    throw error;
  }
}

async function contractFor(tasks, taskType) {
  requireTaskType(taskType);
  const contract = await tasks.getCreatorCampaignContract(taskType);
  const availableCompletionModes = contract.availableCompletionModes || [];
  const campaignPricing = {
    minTarget: CREATOR_MIN_TARGET,
    targetStep: CREATOR_TARGET_STEP,
    maxTarget: null,
    priceDZXPerExecution: contract.priceDZX,
    cpmDZX: contract.priceDZX * 1000
  };
  if (taskType === 'social') {
    campaignPricing.completionModes = {
      open_link: { telegramTarget: true, proof: 'click', cpmDZX: SOCIAL_CPM_DZX.open_link },
      server_verified: { provider: 'telegram_bot_api', telegramTarget: true, proof: 'server_verification', cpmDZX: SOCIAL_CPM_DZX.server_verified }
    };
  }
  return {
    ...contract,
    completionServices: availableCompletionModes.map(mode => ({ mode, description: CONTRACT_DESCRIPTIONS[mode] })),
    providerContracts: getCreatorProviderContracts(taskType),
    campaignPricing
  };
}

function createCreatorTaskRouter({ wallet = walletService, tasks = taskService, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(auth);

  router.get('/contracts/:taskType', asyncRoute(async (req, res) => {
    res.json(await contractFor(tasks, req.params.taskType));
  }));

  router.post('/', createValidationMiddleware(validateCreatorTaskBody), asyncRoute(async (req, res) => {
    const { taskType, title, description, target, config, idempotencyKey } = req.body;
    requireTaskType(taskType);
    validateCreatorProvider(taskType, config);

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const rewards = await tasks.getCreatorActivityRewards();
    const result = await tasks.createCreatorCampaign({
      taskType,
      title,
      description: description || null,
      creatorId: user.id,
      target,
      rewardCoin: rewards.rewardCoin,
      rewardDzx: rewards.rewardDZX,
      rewardDzp: rewards.rewardDZP,
      config,
      idempotencyKey
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

module.exports = { CREATOR_TASK_TYPES, CREATOR_MIN_TARGET, CREATOR_TARGET_STEP, SOCIAL_CPM_DZX, CONTRACT_DESCRIPTIONS, createCreatorTaskRouter };
