'use strict';

const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');
const service = require('../services/admin-task-campaign-service');

function createAdminTaskCampaignRouter({ tasks = service } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/', asyncRoute(async (req, res) => {
    res.json({ ok: true, tasks: await tasks.listAdminTasks({ status: req.query.status || null }) });
  }));

  router.post('/:taskId/review', asyncRoute(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ ok: false, error: 'taskId must be a positive integer' });
    const result = await tasks.reviewCreatorCampaign({
      taskId,
      action: req.body?.action,
      actorTelegramUserId: req.adminTelegramUserId,
      reason: req.body?.reason,
      idempotencyKey: req.body?.idempotencyKey
    });
    res.json({ ok: true, ...result });
  }));

  return router;
}

module.exports = { createAdminTaskCampaignRouter };
