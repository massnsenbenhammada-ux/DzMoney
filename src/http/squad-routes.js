const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { provisionSquadForUsers } = require('../services/squad-provisioning-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

router.get('/', asyncRoute(async (req, res) => {
  const telegramUserId = String(req.telegramUser.id);
  const user = await query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramUserId]);
  const userId = user.rows[0]?.id;
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });

  await provisionSquadForUsers({ transaction: withTransaction });
  const membership = await query(`
    SELECT s.id AS squad_id, s.owner_user_id,
           COUNT(sm2.id) FILTER (WHERE sm2.status <> 'cancelled') AS member_count
    FROM squad_memberships sm
    JOIN squads s ON s.id = sm.squad_id
    LEFT JOIN squad_memberships sm2 ON sm2.squad_id = s.id
    WHERE sm.user_id = $1 AND sm.status <> 'cancelled'
    GROUP BY s.id, s.owner_user_id
  `, [userId]);

  if (!membership.rows[0]) return res.json({ ok: true, squad: null });
  const row = membership.rows[0];
  res.json({
    ok: true,
    squad: {
      id: String(row.squad_id),
      ownerUserId: String(row.owner_user_id),
      memberCount: Number(row.member_count),
      isOwner: Number(row.owner_user_id) === Number(userId)
    }
  });
}));

module.exports = router;
