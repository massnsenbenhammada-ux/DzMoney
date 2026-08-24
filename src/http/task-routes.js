const express = require('express');
const walletService = require('../services/wallet-service');
const taskService = require('../services/task-service');
const { telegramAuth } = require('./telegram-auth');

function createTaskRouter({ wallet = walletService, tasks = taskService } = {}) {
  const router = express.Router();
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.use(telegramAuth);

  router.get('/', asyncRoute(async (req, res) => {
    const tasksList = await tasks.listActiveTasks({ userId: req.telegramUser.id });
    res.json({ success: true, tasks: tasksList });
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
    res.json({ ok: true, clicked: result.clicked, duplicate: result.duplicate });
  }));

  return router;
}

module.exports = { createTaskRouter };