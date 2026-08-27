const express = require('express');
const walletService = require('../services/wallet-service');
const dailyTasks = require('../services/daily-system-task-service');
const taskVerificationService = require('../services/task-verification-service');
const taskAdvertisementService = require('../services/task-advertisement-service');
const providerRegistryRuntime = require('../services/ad-provider-registry-runtime');
const { DAILY_SYSTEM_TASKS } = require('../services/daily-system-task-contract');
const { telegramAuth } = require('./telegram-auth');
const { createRateLimit } = require('./rate-limit');

const SYSTEM_TASK_KEYS = new Set(Object.values(DAILY_SYSTEM_TASKS));

function createDailySystemTaskRouter({ wallet = walletService, tasks = dailyTasks, verification = taskVerificationService, advertisement = taskAdvertisementService, providerRegistry = providerRegistryRuntime, auth = telegramAuth } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const userRateLimit = createRateLimit({ windowMs: 60_000, max: 60 });
  const sensitiveRateLimit = createRateLimit({ windowMs: 60_000, max: 15 });

  router.use(auth);
  router.use(userRateLimit);

  router.get('/', asyncRoute(async (req, res) => {
    const systemKey = String(req.query?.systemKey || DAILY_SYSTEM_TASKS.CHECK_FOR_UPDATE);
    if (!SYSTEM_TASK_KEYS.has(systemKey)) return res.status(400).json({ ok: false, error: 'Unsupported system task' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    const task = await tasks.getSystemTask(systemKey);
    const available = systemKey === DAILY_SYSTEM_TASKS.VIEW_ADS
      ? await tasks.assertAdvertisementAvailable(task, user.id)
      : task.config?.achievementThreshold !== undefined
        ? await tasks.assertReferralAchievementAvailable(task, user.id)
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

  router.post('/execute', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'request body must be an object' });
    const allowed = new Set(['idempotencyKey', 'systemKey', 'metadata']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ ok: false, error: 'unknown request field' });
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    const idempotencyKey = body.idempotencyKey;
    const systemKey = String(body.systemKey || DAILY_SYSTEM_TASKS.CHECK_FOR_UPDATE);
    if (!SYSTEM_TASK_KEYS.has(systemKey)) return res.status(400).json({ ok: false, error: 'Unsupported system task' });
    if (body.metadata !== undefined && (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))) return res.status(400).json({ ok: false, error: 'metadata must be an object' });
    const user = await wallet.createUser({
      telegramUserId: String(req.telegramUser.id),
      username: req.telegramUser.username || null,
      firstName: req.telegramUser.first_name || null,
      photoUrl: req.telegramUser.photo_url || null
    });
    if (systemKey === DAILY_SYSTEM_TASKS.VIEW_ADS) {
      const task = await tasks.getSystemTask(systemKey);
      if (!await tasks.assertAdvertisementAvailable(task, user.id)) {
        throw new Error('Daily task is already completed for the current UTC+1 day');
      }
      const result = await advertisement.startTaskAdvertisement({ userId: user.id, taskId: task.id, idempotencyKey, providerRegistry });
      return res.json({ ok: true, adEventId: result.adEvent.id, providerId: result.providerId, duplicate: result.duplicate });
    }
    const result = await tasks.executeSystemTask({ systemKey, userId: user.id, idempotencyKey, metadata: body.metadata || {} });
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

  router.post('/verify', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'request body must be an object' });
    const allowed = new Set(['attemptId', 'idempotencyKey']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ ok: false, error: 'unknown request field' });
    const attemptId = Number(body.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ ok: false, error: 'attemptId must be a positive integer' });
    const idempotencyKey = body.idempotencyKey || `daily-system:${attemptId}`;
    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is invalid' });
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

  router.post('/advertisement/finalize', sensitiveRateLimit, asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'request body must be an object' });
    const allowed = new Set(['adEventId']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ ok: false, error: 'unknown request field' });
    const adEventId = Number(body.adEventId);
    if (!Number.isInteger(adEventId) || adEventId <= 0) return res.status(400).json({ ok: false, error: 'adEventId must be a positive integer' });
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
