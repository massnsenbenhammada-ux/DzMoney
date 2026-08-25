const express = require('express');
const walletService = require('../services/wallet-service');
const dailyTasks = require('../services/daily-system-task-service');
const taskVerificationService = require('../services/task-verification-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');

function createDailySystemTaskRouter({ wallet = walletService, tasks = dailyTasks, verification = taskVerificationService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(auth);

  router.get('/', asyncRoute(async (req, res) => {
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const task = await tasks.getSystemTask(req.query?.systemKey || 'check_for_update');
    const available = await tasks.assertAvailable(task, user.id);
    res.json({
      ok: true,
      task: {
        id: task.id,
        systemKey: task.config?.systemKey,
        title: task.title,
        description: task.description,
        rewardCoin: Number(task.reward_coin),
        rewardDzx: Number(task.reward_dzx),
        rewardDzp: Number(task.reward_dzp),
        available
      }
    });
  }));

  router.post('/execute', asyncRoute(async (req, res) => {
    const idempotencyKey = req.body?.idempotencyKey;
    if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await tasks.executeSystemTask({
      systemKey: req.body?.systemKey || 'check_for_update',
      userId: user.id,
      idempotencyKey,
      metadata: req.body?.metadata || {}
    });
    const verificationAd = await verification.startTaskVerificationAd({
      attemptId: result.attempt.id,
      idempotencyKey: result.gate.idempotency_key,
      providerRegistry
    });
    res.json({
      ok: true,
      attemptId: result.attempt.id,
      gateId: result.gate.id,
      verificationAdId: verificationAd.adEvent?.external_ad_id || null,
      verificationProvider: verificationAd.providerId || null,
      verificationStatus: result.gate.status,
      duplicate: result.duplicate
    });
  }));

  router.post('/verify', asyncRoute(async (req, res) => {
    const attemptId = req.body?.attemptId;
    const idempotencyKey = req.body?.idempotencyKey || `daily-system:${attemptId}`;
    if (!attemptId) return res.status(400).json({ ok: false, error: 'attemptId is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    await verification.getTaskVerificationStatus({ attemptId, userId: user.id });
    const result = await verification.finalizeTaskVerification({ attemptId, idempotencyKey });
    res.json({ ok: true, ...result });
  }));

  return router;
}

module.exports = { createDailySystemTaskRouter };
