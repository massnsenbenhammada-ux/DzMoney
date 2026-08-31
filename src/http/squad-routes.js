const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { createInvitation, acceptInvitation } = require('../services/squad-membership-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

async function currentUserId(req) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id = $1', [String(req.telegramUser.id)]);
  return result.rows[0]?.id || null;
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });

  const membership = await query(`
    SELECT s.id AS squad_id, s.owner_user_id,
           COUNT(sm2.id) FILTER (WHERE sm2.status <> 'cancelled') AS member_count,
           sm.status AS membership_status
    FROM squad_memberships sm
    JOIN squads s ON s.id = sm.squad_id
    LEFT JOIN squad_memberships sm2 ON sm2.squad_id = s.id
    WHERE sm.user_id = $1 AND sm.status <> 'cancelled'
    GROUP BY s.id, s.owner_user_id, sm.status
  `, [userId]);

  if (!membership.rows[0]) return res.json({ ok: true, squad: null });
  const row = membership.rows[0];
  res.json({
    ok: true,
    squad: {
      id: String(row.squad_id),
      ownerUserId: String(row.owner_user_id),
      memberCount: Number(row.member_count),
      membershipStatus: row.membership_status,
      isOwner: Number(row.owner_user_id) === Number(userId)
    }
  });
}));

router.get('/invitations', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await query(`
    SELECT i.id, i.squad_id, i.inviter_user_id, i.status, i.created_at
    FROM squad_invitations i
    WHERE i.invitee_user_id = $1 AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `, [userId]);
  res.json({ ok: true, invitations: result.rows.map(row => ({
    id: String(row.id),
    squadId: String(row.squad_id),
    inviterUserId: String(row.inviter_user_id),
    status: row.status,
    createdAt: row.created_at
  })) });
}));

router.post('/invitations', asyncRoute(async (req, res) => {
  const inviterUserId = await currentUserId(req);
  if (!inviterUserId) return res.status(404).json({ ok: false, error: 'User not found' });
  const squadId = Number(req.body?.squadId);
  const telegramUserId = String(req.body?.inviteeTelegramUserId || '');
  if (!Number.isInteger(squadId) || squadId <= 0 || !telegramUserId) return res.status(400).json({ ok: false, error: 'squadId and inviteeTelegramUserId are required' });
  const invitee = await query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramUserId]);
  if (!invitee.rows[0]) return res.status(404).json({ ok: false, error: 'Invitee user not found' });
  const invitation = await createInvitation({ squadId, inviterUserId, inviteeUserId: invitee.rows[0].id });
  res.status(201).json({ ok: true, invitation: { ...invitation, id: String(invitation.id), squad_id: String(invitation.squad_id), invitee_user_id: String(invitation.invitee_user_id) } });
}));

router.post('/invitations/:id/accept', asyncRoute(async (req, res) => {
  const inviteeUserId = await currentUserId(req);
  if (!inviteeUserId) return res.status(404).json({ ok: false, error: 'User not found' });
  const invitationId = Number(req.params.id);
  if (!Number.isInteger(invitationId) || invitationId <= 0) return res.status(400).json({ ok: false, error: 'Invalid invitation id' });
  const membership = await acceptInvitation({ invitationId, inviteeUserId });
  res.status(201).json({ ok: true, membership: { ...membership, id: String(membership.id), squad_id: String(membership.squad_id), user_id: String(membership.user_id) } });
}));

module.exports = router;
