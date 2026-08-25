const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const taskVerificationService = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');

function createTaskRouter({ wallet = walletService, tasks = taskService, verification = taskVerificationService, advertisement = taskAdvertisementService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(auth);

  router.get('/', asyncRoute(async (req, res) => {
    const tasksList = await tasks.listActiveTasks({ userId: req.telegramUser.id });
    res.json({ success: true, tasks: tasksList });
  }));

  router.post('/execute', asyncRoute(async (req, res) => {
    const taskId = req.body?.taskId;
    const idempotencyKey = req.body?.idempotencyKey;
    if (taskId === undefined || taskId === null || taskId === '') return res.status(400).json({ ok: false, error: 'taskId is required' });
    if (idempotencyKey === undefined || idempotencyKey === null || idempotencyKey === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const result = await tasks.executeTask({ taskId, userId: user.id, idempotencyKey, metadata: req.body?.metadata || {} });
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
    const taskId = req.body?.taskId;
    const idempotencyKey = req.body?.idempotencyKey;
    if (taskId === undefined || taskId === null || taskId === '') return res.status(400).json({ ok: false, error: 'taskId is required' });
    if (idempotencyKey === undefined || idempotencyKey === null || idempotencyKey === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.startTaskAdvertisement({
      userId: user.id,
      taskId,
      idempotencyKey,
      externalAdId: req.body?.externalAdId || null,
      providerId: req.body?.providerId || null,
      providerRegistry
    });
    res.json({ ok: true, adEventId: result.adEvent?.id, providerId: result.providerId, duplicate: result.duplicate });
  }));

  router.post('/advertisement/verify', asyncRoute(async (req, res) => {
    const adEventId = req.body?.adEventId;
    if (adEventId === undefined || adEventId === null || adEventId === '') return res.status(400).json({ ok: false, error: 'adEventId is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.verifyTaskAdvertisement({ userId: user.id, adEventId, providerRegistry, providerPayload: req.body?.providerPayload || {} });
    res.json({ ok: true, adEventId: result.adEvent?.id, verified: result.adEvent?.verified === true, duplicate: result.duplicate });
  }));

  router.post('/advertisement/finalize', asyncRoute(async (req, res) => {
    const adEventId = req.body?.adEventId;
    if (adEventId === undefined || adEventId === null || adEventId === '') return res.status(400).json({ ok: false, error: 'adEventId is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.finalizeTaskAdvertisement({ userId: user.id, adEventId });
    res.json({ ok: true, rewarded: result.rewarded === true, duplicate: result.duplicate, rewardIdempotencyKey: result.rewardIdempotencyKey || null });
  }));

  router.post('/click', asyncRoute(async (req, res) => {
    const attemptId = req.body?.attemptId;
    if (attemptId === undefined || attemptId === null || attemptId === '') {
      return res.status(400).json({ ok: false, error: 'attemptId is required' });
    }

    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });

    const result = await tasks.recordTaskClick({ attemptId, userId: user.id });
    const finalization = await verification.finalizeTaskVerification({
      attemptId,
      idempotencyKey: `task:${attemptId}`
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
