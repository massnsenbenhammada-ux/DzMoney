const express = require('express');
const { requireAdmin } = require('./admin-auth');
const { saveProviderConfiguration } = require('../services/admin-provider-config-service');

const ALLOWED_CONTEXTS = ['task', 'reward_pool', 'daily_checkin', 'verification'];

function createAdminProviderRouter({ registry }) {
  if (!registry || typeof registry.listRegistered !== 'function') {
    throw new Error('Advertisement provider registry is required');
  }

  const router = express.Router();
  router.use(requireAdmin);

  router.get('/', async (req, res, next) => {
    try {
      const configurations = await require('../services/admin-provider-config-service').loadProviderConfigurations();
      res.json({ ok: true, providers: configurations.map(({ providerId, enabled, priority, contexts, timeoutMs }) => ({ providerId, enabled, priority, contexts, timeoutMs })) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/', async (req, res, next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ ok: false, error: 'Provider configuration body is required' });
      }
      if (!Array.isArray(body.configurations)) {
        return res.status(400).json({ ok: false, error: 'Provider configurations must be an array' });
      }
      for (const config of body.configurations) {
        if (!config || typeof config.providerId !== 'string') return res.status(400).json({ ok: false, error: 'Provider id is required' });
        if (!Array.isArray(config.contexts) || !config.contexts.length || config.contexts.some(context => !ALLOWED_CONTEXTS.includes(context))) {
          return res.status(400).json({ ok: false, error: 'Invalid advertisement context' });
        }
      }
      const saved = await saveProviderConfiguration({
        configurations: body.configurations,
        registeredProviderIds: registry.listRegistered(),
        actorTelegramUserId: String(req.telegramUser.id)
      });
      return res.json({ ok: true, providers: saved });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminProviderRouter };
