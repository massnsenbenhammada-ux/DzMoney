const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createRateLimit } = require('./rate-limit');
const { getAdminDashboardMetrics } = require('../services/admin-dashboard-service');

function createAdminDashboardRouter({ dashboard = { getAdminDashboardMetrics } } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(adminAuth);
  router.use(createRateLimit({ windowMs: 60_000, max: 60 }));

  router.get('/access', (_req, res) => {
    res.json({ ok: true, admin: true });
  });

  router.get('/', asyncRoute(async (_req, res) => {
    const metrics = await dashboard.getAdminDashboardMetrics();
    res.json({ ok: true, ...metrics });
  }));

  return router;
}

module.exports = { createAdminDashboardRouter };
