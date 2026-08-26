const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const taskVerificationService = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');

function invalidInput(res, error) {
  return res.status(400).json({ ok: false, error });
}

function validateBody(body, schema) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'request body must be an object';
  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) return `unknown field: ${key}`;
    if (schema[key] !== null && typeof body[key] !== schema[key]) return `${key} must be ${schema[key]}`;
  }
  for (const [key, type] of Object.entries(schema)) {
    if (type !== null && (body[key] === undefined || body[key] === null || body[key] === '')) return `${key} is required`;
  }
  return null;
}

function validateAttemptId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 ? null : 'attemptId must be a positive integer';
}

function validateAdEventId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 ? null : 'adEventId must be a positive integer';
}

function createTaskRouter({ wallet = walletService, tasks = taskService, verification = taskVerificationService, advertisement = taskAdvertisementService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(auth);

  router.get('/', asyncRoute(async (req, res) => {
    const tasksList = await tasks.listActiveTasks({ userId: req.telegramUser.id });
    res.json({ success: true, tasks: tasksList });
  }));

  router.post('/execute', asyncRoute(async (req, res) => {
    const validationError = validateBody(req.body, { taskId: 'number', idempotencyKey: 'string', metadata: null });
    if (validationError) return invalidInput(res, validationError);
    if (req.body.metadata !== undefined && (!req.body.metadata || typeof req.body.metadata !== 'object' || Array.isArray(req.body.metadata))) {
      return invalidInput(res, 'metadata must be an object');
    }

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const result = await tasks.executeTask({ taskId: req.body.taskId, userId: user.id, idempotencyKey: req.body.idempotencyKey, metadata: req.body.metadata || {} });
    const verificationAd = await verification.startTaskVerificationAd({
      attemptId: result.attempt?.id,
      idempotencyKey: result.gate?.idempotency_key || `verification:${result.attempt?.id}`,
      providerRegistry
    });
    res.json({
      ok: true,
      attemptId: result.attempt?.id,
      gateId: result.gate?.id,
      verificationAdId: verificationAd.adEvent?.external_ad_id || null,
      verificationProvider: verificationAd.providerId || null,
      verificationStatus: result.gate?.status || 'pending',
      duplicate: result.duplicate
    });
  }));

  router.post('/advertisement/start', asyncRoute(async (req, res) => {
    const validationError = validateBody(req.body, { taskId: 'number', idempotencyKey: 'string' });
    if (validationError) return invalidInput(res, validationError);
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.startTaskAdvertisement({
      userId: user.id,
      taskId: req.body.taskId,
      idempotencyKey: req.body.idempotencyKey,
      providerRegistry
    });
    res.json({ ok: true, adEventId: result.adEvent?.id, providerId: result.providerId, duplicate: result.duplicate });
  }));

  router.post('/advertisement/finalize', asyncRoute(async (req, res) => {
    const validationError = validateBody(req.body, { adEventId: 'number' });
    if (validationError) return invalidInput(res, validationError);
    const adEventIdError = validateAdEventId(req.body.adEventId);
    if (adEventIdError) return invalidInput(res, adEventIdError);
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.finalizeTaskAdvertisement({ userId: user.id, adEventId: req.body.adEventId });
    res.json({ ok: true, rewarded: result.rewarded === true, duplicate: result.duplicate, rewardIdempotencyKey: result.rewardIdempotencyKey || null });
  }));

  router.post('/click', asyncRoute(async (req, res) => {
    const validationError = validateBody(req.body, { attemptId: 'number' });
    if (validationError) return invalidInput(res, validationError);
    const attemptIdError = validateAttemptId(req.body.attemptId);
    if (attemptIdError) return invalidInput(res, attemptIdError);

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const result = await tasks.recordTaskClick({ attemptId: req.body.attemptId, userId: user.id });
    const finalization = await verification.finalizeTaskVerification({
      attemptId: req.body.attemptId,
      idempotencyKey: `task:${req.body.attemptId}`
    });
    res.json({
      ok: true,
      clicked: result.clicked,
      duplicate: result.duplicate,
      status: finalization.status,
      rewarded: finalization.rewarded === true,
      reason: finalization.reason || null
    });
  }));

  router.get('/attempt/:attemptId', asyncRoute(async (req, res) => {
    const attemptIdError = validateAttemptId(req.params.attemptId);
    if (attemptIdError) return invalidInput(res, attemptIdError);
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const status = await verification.getTaskVerificationStatus({ attemptId: req.params.attemptId, userId: user.id });
    res.json({ ok: true, ...status });
  }));

  return router;
}

module.exports = { createTaskRouter };
