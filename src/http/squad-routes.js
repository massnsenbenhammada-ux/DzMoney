const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { createInvitation, acceptInvitation, getPaidMembershipTiers, purchasePaidMembership } = require('../services/squad-membership-service');
const { getCurrentUserSquadState } = require('../services/squad-daily-state-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(telegramAuth);

async function currentUserId(req) { const result = await query('SELECT id FROM users WHERE telegram_user_id = $1', [String(req.telegramUser.id)]); return result.rows[0]?.id || null; }
async function getSquadAdsTask() { const result = await query("SELECT id,title,description,config FROM activity_tasks WHERE status='active' AND creator_id IS NULL AND config->>'systemKey'='squad_ads' LIMIT 1"); return result.rows[0] || null; }
function dailyAdvertisementDateFilter() { return " AND (completed_at + INTERVAL '1 hour')::date=(NOW() + INTERVAL '1 hour')::date"; }

router.get('/', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const membership = await query(`SELECT s.id AS squad_id, s.owner_user_id, COUNT(sm2.id) FILTER (WHERE sm2.status <> 'cancelled') AS member_count, sm.status AS membership_status FROM squad_memberships sm JOIN squads s ON s.id = sm.squad_id LEFT JOIN squad_memberships sm2 ON sm2.squad_id = s.id WHERE sm.user_id = $1 AND sm.status <> 'cancelled' GROUP BY s.id, s.owner_user_id, sm.status`, [userId]);
  if (!membership.rows[0]) return res.json({ ok: true, squad: null }); const row = membership.rows[0];
  res.json({ ok: true, squad: { id: String(row.squad_id), ownerUserId: String(row.owner_user_id), memberCount: Number(row.member_count), membershipStatus: row.membership_status, isOwner: Number(row.owner_user_id) === Number(userId) } });
}));

router.get('/daily-state', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const state = await getCurrentUserSquadState({ userId }); res.json({ ok: true, state }); }));

router.get('/ads', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const task = await getSquadAdsTask(); if (!task) return res.status(404).json({ ok: false, error: 'Squad Ads task is not configured' });
  const target = Number(task.config?.advertisementTarget); if (!Number.isInteger(target) || target <= 0) return res.status(500).json({ ok: false, error: 'Invalid Squad Ads target' });
  const dateFilter = task.config?.dailyMode === 'advertisement' ? dailyAdvertisementDateFilter() : '';
  const result = await query(`SELECT COUNT(*)::int AS completed FROM activity_ad_events WHERE user_id=$1 AND context='squad' AND verified=true AND metadata->>'task_id'=$2${dateFilter}`, [userId, String(task.id)]);
  const completed = Math.min(Number(result.rows[0]?.completed || 0), target);
  if (req.query.adEventId) {
    const eventId = Number(req.query.adEventId); if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ ok: false, error: 'Invalid adEventId' });
    const event = await query('SELECT id,verified,completed_at,metadata FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context=$3', [eventId, userId, 'squad']);
    if (!event.rowCount) return res.status(404).json({ ok: false, error: 'Squad advertisement event not found' });
    return res.json({ ok: true, task: { id: Number(task.id), title: task.title, description: task.description, completed, target }, event: { id: Number(event.rows[0].id), verified: event.rows[0].verified === true, rewarded: Boolean(event.rows[0].metadata?.reward_transaction_id), completedAt: event.rows[0].completed_at } });
  }
  res.json({ ok: true, task: { id: Number(task.id), title: task.title, description: task.description, completed, target, available: completed < target } });
}));

router.get('/membership-tiers', asyncRoute(async (req, res) => { const tiers = await getPaidMembershipTiers({ query: (...args) => query(...args) }); res.json({ ok: true, tiers }); }));
router.post('/membership/purchase', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const keys = Object.keys(req.body || {}); if (keys.some(key => !['maxMembers', 'idempotencyKey'].includes(key))) return res.status(400).json({ ok: false, error: 'Unknown purchase fields' }); const maxMembers = Number(req.body?.maxMembers); const idempotencyKey = String(req.body?.idempotencyKey || ''); if (!Number.isInteger(maxMembers) || maxMembers <= 0 || !idempotencyKey) return res.status(400).json({ ok: false, error: 'maxMembers and idempotencyKey are required' }); const result = await purchasePaidMembership({ userId, maxMembers, idempotencyKey }); res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, membership: { ...result.membership, id: String(result.membership.id), squad_id: String(result.membership.squad_id), user_id: String(result.membership.user_id) }, price: result.price, tier: result.tier, transactionId: result.transaction ? String(result.transaction.id) : undefined }); }));
router.get('/invitations', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const result = await query(`SELECT i.id, i.squad_id, i.inviter_user_id, i.status, i.created_at FROM squad_invitations i WHERE i.invitee_user_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC`, [userId]); res.json({ ok: true, invitations: result.rows.map(row => ({ id: String(row.id), squadId: String(row.squad_id), inviterUserId: String(row.inviter_user_id), status: row.status, createdAt: row.created_at })) }); }));
router.post('/invitations', asyncRoute(async (req, res) => { const inviterUserId = await currentUserId(req); if (!inviterUserId) return res.status(404).json({ ok: false, error: 'User not found' }); const squadId = Number(req.body?.squadId); const telegramUserId = String(req.body?.inviteeTelegramUserId || ''); if (!Number.isInteger(squadId) || squadId <= 0 || !telegramUserId) return res.status(400).json({ ok: false, error: 'squadId and inviteeTelegramUserId are required' }); const invitee = await query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramUserId]); if (!invitee.rows[0]) return res.status(404).json({ ok: false, error: 'Invitee user not found' }); const invitation = await createInvitation({ squadId, inviterUserId, inviteeUserId: invitee.rows[0].id }); res.status(201).json({ ok: true, invitation: { ...invitation, id: String(invitation.id), squad_id: String(invitation.squad_id), invitee_user_id: String(invitation.invitee_user_id) } }); }));
router.post('/invitations/:id/accept', asyncRoute(async (req, res) => { const inviteeUserId = await currentUserId(req); if (!inviteeUserId) return res.status(404).json({ ok: false, error: 'User not found' }); const invitationId = Number(req.params.id); if (!Number.isInteger(invitationId) || invitationId <= 0) return res.status(400).json({ ok: false, error: 'Invalid invitation id' }); const membership = await acceptInvitation({ invitationId, inviteeUserId }); res.status(201).json({ ok: true, membership: { ...membership, id: String(membership.id), squad_id: String(membership.squad_id), user_id: String(membership.user_id) } }); }));

module.exports = router;