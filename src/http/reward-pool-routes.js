const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { getRewardPoolStatus } = require('../services/reward-pool-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

async function currentUserId(req) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id=$1', [String(req.telegramUser.id)]);
  return result.rows[0]?.id || null;
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const status = await getRewardPoolStatus({ userId });
  res.json({ ok: true, rewardPool: status });
}));

module.exports = router;
