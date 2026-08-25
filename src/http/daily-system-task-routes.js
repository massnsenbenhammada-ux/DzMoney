const express = require('express');
const walletService = require('../services/wallet-service');
const dailyTasks = require('../services/daily-system-task-service');
const taskVerificationService = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { telegramAuth } = require('./telegram-auth');

function createDailySystemTaskRouter({ wallet = walletService, tasks = dailyTasks, verification = taskVerificationService, advertisement = taskAdvertisementService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
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
    const systemKey = req.query?.systemKey || 'check_for_update';
    const task = await tasks.getSystemTask(systemKey);
    const available = systemKey === 'view_ads'
      ? await tasks.assertAdvertisementAvailable(task, user.id)
      : await tasks.assertAvailable(task, user.id);
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
    const systemKey = req.body?.systemKey || 'check_for_update';
    if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    if (systemKey === 'view_ads') {
      const task = await tasks.getSystemTask(systemKey);
      if (!await tasks.assertAdvertisementAvailable(task, user.id)) {
        throw new Error('Daily task is already completed for the current UTC+1 day');
      }
      const result = await advertisement.startTaskAdvertisement({ userId: user.id, taskId: task.id, idempotencyKey, providerRegistry });
      return res.json({ ok: true, adEventId: result.adEvent.id, providerId: result.providerId, duplicate: result.duplicate });
    }
    const result = await tasks.executeSystemTask({ systemKey, userId: user.id, idempotencyKey, metadata: req.body?.metadata || {} });
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

  router.post('/advertisement/finalize', asyncRoute(async (req, res) => {
    const adEventId = req.body?.adEventId;
    if (!adEventId) return res.status(400).json({ ok: false, error: 'adEventId is required' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const result = await advertisement.finalizeTaskAdvertisement({ userId: user.id, adEventId });
    res.json({ ok: true, ...result });
  }));

  return router;
}

module.exports = { createDailySystemTaskRouter };
