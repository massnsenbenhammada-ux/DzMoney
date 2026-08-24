const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const taskVerificationService = require('../services/task-verification-service');
const { telegramAuth } = require('./telegram-auth');

function createTaskRouter({ wallet = walletService, tasks = taskService, verification = taskVerificationService, providerRegistry, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  if (!providerRegistry) throw new Error('Task router requires the trusted advertisement provider registry');

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
      attemptId: result.attempt.id,
      idempotencyKey: `task-verification-ad:${result.attempt.id}`,
      providerRegistry,
      providerId: req.body?.providerId || null
    });
    res.json({
      ok: true,
      attemptId: result.attempt.id,
      gateId: result.gate?.id,
      duplicate: result.duplicate || verificationAd.duplicate,
      verificationAd: {
        eventId: verificationAd.adEvent.id,
        externalAdId: verificationAd.adEvent.external_ad_id,
        providerId: verificationAd.providerId
      }
    });
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
    const finalized = await verification.finalizeTaskVerification({
      attemptId,
      idempotencyKey: `task-reward:${attemptId}`
    });
    res.json({ ok: true, clicked: result.clicked, duplicate: result.duplicate, verification: finalized });
  }));

  return router;
}

module.exports = { createTaskRouter };
