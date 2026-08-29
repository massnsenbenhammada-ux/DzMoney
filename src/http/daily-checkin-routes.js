const express = require('express');
const walletService = require('../services/wallet-service');
const dailyTasks = require('../services/daily-system-task-service');
const taskVerificationService = require('../services/task-verification-service');
const { DAILY_SYSTEM_TASKS } = require('../services/daily-system-task-contract');
const { telegramAuth } = require('./telegram-auth');
const { createRateLimit } = require('./rate-limit');

function createDailyCheckinRouter({ providerRegistry, tasks = dailyTasks, verification = taskVerificationService }) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(telegramAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/status', asyncRoute(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    const task = await tasks.getSystemTask(DAILY_SYSTEM_TASKS.CHECK_IN);
    const available = await tasks.assertAvailable(task, user.id);
    const pending = await getPendingAttempt(task.id, user.id);
    if (pending) return res.json({ ok: true, status: 'pending', attemptId: pending.id });
    if (available) return res.json({ ok: true, status: 'available' });
    const completedAt = await getLatestCompletion(task.id, user.id);
    const nextEligibleAt = completedAt ? new Date(new Date(completedAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    res.json({ ok: true, status: 'cooldown', nextEligibleAt });
  }));

  router.post('/claim', createRateLimit({ windowMs: 60_000, max: 10 }), asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'request body must be an object' });
    const allowed = new Set(['idempotencyKey', 'providerId']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ ok: false, error: 'unknown request field' });
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
    if (body.providerId !== undefined && body.providerId !== null && typeof body.providerId !== 'string') return res.status(400).json({ ok: false, error: 'providerId must be a string' });
    const user = await getAuthenticatedUser(req);
    const result = await tasks.executeSystemTask({ systemKey: DAILY_SYSTEM_TASKS.CHECK_IN, userId: user.id, idempotencyKey: body.idempotencyKey, metadata: { source: 'legacy_daily_checkin_compatibility' } });
    const verificationAd = await verification.startTaskVerificationAd({ attemptId: result.attempt.id, idempotencyKey: result.gate.idempotency_key, providerRegistry });
    res.json({ ok: true, claimIdempotencyKey: body.idempotencyKey, adEvent: { external_ad_id: verificationAd.adEvent?.external_ad_id || null }, providerId: verificationAd.providerId || null, attemptId: result.attempt.id, duplicate: result.duplicate });
  }));

  return router;
}

async function getAuthenticatedUser(req) {
  const telegramUser = req.telegramUser;
  return walletService.createUser({ telegramUserId: String(telegramUser.id), username: telegramUser.username || null, firstName: telegramUser.first_name || null, photoUrl: telegramUser.photo_url || null });
}

async function getPendingAttempt(taskId, userId) {
  const result = await require('../db/pool').query("SELECT id FROM task_attempts WHERE task_id=$1 AND user_id=$2 AND status='verification_pending' ORDER BY id DESC LIMIT 1", [taskId, userId]);
  return result.rows[0] || null;
}

async function getLatestCompletion(taskId, userId) {
  const result = await require('../db/pool').query("SELECT GREATEST(COALESCE((SELECT MAX(verified_at) FROM task_attempts WHERE task_id=$1 AND user_id=$2 AND status='verified'), '-infinity'::timestamptz), COALESCE((SELECT last_claimed_at FROM daily_checkins WHERE user_id=$2), '-infinity'::timestamptz)) AS completed_at", [taskId, userId]);
  const value = result.rows[0]?.completed_at;
  return value && value !== '-infinity' ? value : null;
}

module.exports = { createDailyCheckinRouter };
