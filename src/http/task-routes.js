const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { getDailyCheckin, resolveUserIdFromTelegram } = require('../services/daily-checkin-service');

const router = express.Router();
router.use(telegramAuth);

router.get('/', async (req, res) => {
  try {
    const tasks = await query(
      `SELECT id, task_type, title, description,
              reward_coin, reward_dzx, reward_dzp,
              verification_ad_seconds, status, config
       FROM activity_tasks
       WHERE status = 'active'
       ORDER BY CASE WHEN task_type = 'daily' THEN 0 ELSE 1 END, id ASC`
    );

    const userId = await resolveUserIdFromTelegram(req.telegramUser.id);
    const rows = [];
    for (const task of tasks.rows) {
      const config = task.config || {};
      const item = {
        id: String(task.id),
        type: task.task_type,
        title: task.title,
        description: task.description,
        category: config.category || task.task_type,
        handler: config.handler || 'task',
        reward: {
          coin: Number(task.reward_coin),
          dzx: Number(task.reward_dzx),
          dzp: Number(task.reward_dzp),
        },
        verificationAdSeconds: task.verification_ad_seconds,
        status: 'available',
      };

      if (config.handler === 'daily_checkin') {
        const daily = await getDailyCheckin(userId);
        item.status = daily.status;
        item.cooldownHours = daily.cooldownHours;
        item.lastClaimedAt = daily.lastClaimedAt;
        item.nextAvailableAt = daily.nextAvailableAt;
        item.pendingAdEventId = daily.pendingAdEventId;
        item.reward = daily.reward;
      }

      rows.push(item);
    }

    res.json({ ok: true, tasks: rows });
  } catch (error) {
    console.error('Tasks list failed:', error);
    const status = /Telegram user is not registered/i.test(error.message) ? 403 : 500;
    res.status(status).json({ error: error.message || 'Unable to load tasks' });
  }
});

module.exports = router;
