const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const taskVerificationService = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');
const { createRateLimit } = require('./rate-limit');

function createTaskRouter({ wallet = walletService, tasks = taskService, verification = taskVerificationService, advertisement = taskAdvertisementService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const userRateLimit = createRateLimit({ windowMs: 60_000, max: 60 });
  const sensitiveRateLimit = createRateLimit({ windowMs: 60_000, max: 20 });
  const validateExecuteBody = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'request body must be an object';
    const allowed = new Set(['taskId', 'idempotencyKey', 'metadata']);
    if (Object.keys(body).some(key => !allowed.has(key))) return 'unknown request field';
    if (!Number.isInteger(body.taskId) || body.taskId <= 0) return 'taskId must be a positive integer';
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') return 'idempotencyKey is required';
    if (body.metadata !== undefined && (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))) return 'metadata must be an object';
    return null;
  };
  const validateAdvertisementStartBody = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'request body must be an object';
    const allowed = new Set(['taskId', 'idempotencyKey']);
    if (Object.keys(body).some(key => !allowed.has(key))) return 'unknown request field';
    if (!Number.isInteger(body.taskId) || body.taskId <= 0) return 'taskId must be a positive integer';
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') return 'idempotencyKey is required';
    return null;
  };
  const validateUrlFormatBody = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'request body must be an object';
    const allowed = new Set(['attemptId', 'userUrl']);
    if (Object.keys(body).some(key => !allowed.has(key))) return 'unknown request field';
    if (!Number.isInteger(body.attemptId) || body.attemptId <= 0) return 'attemptId must be a positive integer';
    if (typeof body.userUrl !== 'string' || body.userUrl.trim() === '') return 'userUrl is required';
    return null;
  };

  router.use(auth);
  router.use(userRateLimit);

  router.get('/', asyncRoute(async (req, res) => {
    const tasksList = await tasks.listActiveTasks({ userId: req.telegramUser.id });
    res.json({ success: true, tasks: tasksList });
  }));

  router.post('/execute', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const validationError = validateExecuteBody(req.body);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const { taskId, idempotencyKey, metadata = {} } = req.body;
    const user = await wallet.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
    const result = await tasks.executeTask({ taskId, userId: user.id, idempotencyKey, metadata });
    const verificationAd = await verification.startTaskVerificationAd({ attemptId: result.attempt?.id, idempotencyKey: result.gate?.idempotency_key || `verification:${result.attempt?.id}`, providerRegistry });
    res.json({ ok: true, attemptId: result.attempt?.id, gateId: result.gate?.id, verificationAdId: verificationAd.adEvent?.external_ad_id || null, verificationProvider: verificationAd.providerId || null, verificationStatus: result.gate?.status || 'pending', duplicate: result.duplicate });
  }));

  router.post('/advertisement/start', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const validationError = validateAdvertisementStartBody(req.body);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const { taskId, idempotencyKey } = req.body;
    const user = await wallet.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
    const result = await advertisement.startTaskAdvertisement({ userId: user.id, taskId, idempotencyKey, providerRegistry });
    res.json({ ok: true, adEventId: result.adEvent?.id, providerId: result.providerId, duplicate: result.duplicate });
  }));

  router.post('/advertisement/finalize', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const adEventId = req.body?.adEventId;
    if (!Number.isInteger(adEventId) || adEventId <= 0) return res.status(400).json({ ok: false, error: 'adEventId must be a positive integer' });
    const user = await wallet.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
    const result = await advertisement.finalizeTaskAdvertisement({ userId: user.id, adEventId });
    res.json({ ok: true, rewarded: result.rewarded === true, duplicate: result.duplicate, rewardIdempotencyKey: result.rewardIdempotencyKey || null });
  }));

  router.post('/url-format', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const validationError = validateUrlFormatBody(req.body);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const { attemptId, userUrl } = req.body;
    const result = await verification.finalizeTaskVerification({ attemptId, idempotencyKey: `task:${attemptId}`, userSubmittedUrl: userUrl });
    res.json({ ok: true, status: result.status, rewarded: result.rewarded === true, duplicate: result.duplicate });
  }));

  router.post('/click', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const attemptId = req.body?.attemptId;
    if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ ok: false, error: 'attemptId must be a positive integer' });
    const user = await wallet.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
    const result = await tasks.recordTaskClick({ attemptId, userId: user.id });
    const finalization = await verification.finalizeTaskVerification({ attemptId, idempotencyKey: `task:${attemptId}` });
    res.json({ ok: true, clicked: result.clicked, duplicate: result.duplicate, status: finalization.status, rewarded: finalization.rewarded === true, reason: finalization.reason || null });
  }));

  router.get('/attempt/:attemptId', asyncRoute(async (req, res) => {
    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ ok: false, error: 'attemptId must be a positive integer' });
    const user = await wallet.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
    const status = await verification.getTaskVerificationStatus({ attemptId, userId: user.id });
    res.json({ ok: true, ...status });
  }));

  return router;
}

module.exports = { createTaskRouter };
