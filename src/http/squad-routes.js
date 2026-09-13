const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { createInvitation, acceptInvitation, getPaidMembershipTiers, getCurrentSquadTier, purchasePaidMembership, switchSquadWithinTier, upgradeSquadTier } = require('../services/squad-membership-service');
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
  const pendingResult = await query(`SELECT id, min_members, max_members, price, status, created_at, settled_at FROM squad_membership_purchase_requests WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC, id ASC LIMIT 1`, [userId]);
  const pending = pendingResult.rows[0] ? { id: String(pendingResult.rows[0].id), tier: { minMembers: Number(pendingResult.rows[0].min_members), maxMembers: pendingResult.rows[0].max_members === null ? null : Number(pendingResult.rows[0].max_members) }, price: Number(pendingResult.rows[0].price), status: pendingResult.rows[0].status, createdAt: pendingResult.rows[0].created_at, settledAt: pendingResult.rows[0].settled_at } : null;
  if (!membership.rows[0]) return res.json({ ok: true, squad: null, pendingMembership: pending });
  const row = membership.rows[0];
  const memberCount = Number(row.member_count);
  const tiers = await getPaidMembershipTiers({ query: (...args) => query(...args) });
  const tier = getCurrentSquadTier(memberCount, tiers);
  const tierLevel = tier ? tiers.findIndex(candidate => candidate.minMembers === tier.minMembers) + 1 : null;
  const isUnbounded = tier?.maxMembers === null;
  const requiredMembers = tier && !isUnbounded ? tier.maxMembers : null;
  const progressPercent = requiredMembers ? Math.min(100, Math.round((memberCount / requiredMembers) * 100)) : null;
  res.json({ ok: true, squad: { id: String(row.squad_id), ownerUserId: String(row.owner_user_id), memberCount, membershipStatus: row.membership_status, isOwner: Number(row.owner_user_id) === Number(userId), tierLevel, currentTier: tier ? { minMembers: tier.minMembers, maxMembers: tier.maxMembers, unbounded: isUnbounded } : null, requiredMembers, progressPercent }, pendingMembership: pending });
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
    const metadata = event.rows[0].metadata || {};
    const rewarded = Boolean(metadata.reward_transaction_id);
    const reward = rewarded ? { coin: Number(metadata.reward_coin || 0), dzx: Number(metadata.reward_dzx || 0), dzp: Number(metadata.reward_dzp || 0) } : null;
    return res.json({ ok: true, task: { id: Number(task.id), title: task.title, description: task.description, completed, target }, event: { id: Number(event.rows[0].id), verified: event.rows[0].verified === true, rewarded, reward, completedAt: event.rows[0].completed_at } });
  }
  res.json({ ok: true, task: { id: Number(task.id), title: task.title, description: task.description, completed, target, available: completed < target } });
}));

router.get('/membership-tiers', asyncRoute(async (req, res) => { const tiers = await getPaidMembershipTiers({ query: (...args) => query(...args) }); res.json({ ok: true, tiers }); }));
router.post('/membership/purchase', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, status: 'rejected', error: 'User not found' });
  const keys = Object.keys(req.body || {}); if (keys.some(key => !['maxMembers', 'idempotencyKey'].includes(key))) return res.status(400).json({ ok: false, status: 'rejected', error: 'Unknown purchase fields' });
  const rawMaxMembers = req.body?.maxMembers;
  const maxMembers = rawMaxMembers === null ? null : Number(rawMaxMembers);
  const idempotencyKey = String(req.body?.idempotencyKey || '');
  if (!((maxMembers === null || (Number.isInteger(maxMembers) && maxMembers > 0)) && idempotencyKey)) return res.status(400).json({ ok: false, status: 'rejected', error: 'maxMembers and idempotencyKey are required' });
  try {
    const result = await purchasePaidMembership({ userId, maxMembers, idempotencyKey });
    const response = { ok: true, status: result.status, duplicate: result.duplicate, price: result.price, tier: result.tier };
    if (result.status === 'pending') response.pendingMembership = { id: String(result.request.id), createdAt: result.request.created_at };
    if (result.status === 'settled') {
      response.membership = { ...result.membership, id: String(result.membership.id), squad_id: String(result.membership.squad_id), user_id: String(result.membership.user_id) };
      if (result.transaction) response.transactionId = String(result.transaction.id);
      if (result.ownerUserId) response.ownerUserId = String(result.ownerUserId);
    }
    return res.status(result.status === 'pending' ? 202 : result.duplicate ? 200 : 201).json(response);
  } catch (error) {
    const rejection = ['Insufficient DZP balance for Squad membership', 'Pending Squad membership request is no longer affordable', 'User already has an eligible Squad membership', 'Requested Squad membership tier is unavailable', 'maxMembers must be a positive integer or null for the unbounded tier'].includes(error.message);
    if (rejection) return res.status(400).json({ ok: false, status: 'rejected', error: error.message });
    throw error;
  }
}));
router.post('/membership/switch', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const keys = Object.keys(req.body || {}); if (keys.some(key => key !== 'idempotencyKey')) return res.status(400).json({ ok: false, error: 'Unknown switch fields' }); const idempotencyKey = String(req.body?.idempotencyKey || ''); if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' }); const result = await switchSquadWithinTier({ userId, idempotencyKey }); res.status(200).json({ ok: true, duplicate: result.duplicate, membership: { ...result.membership, id: String(result.membership.id), squad_id: String(result.membership.squad_id), user_id: String(result.membership.user_id) }, taxDzx: result.taxDzx, tier: result.tier, transactionId: result.transaction ? String(result.transaction.id) : undefined }); }));
router.post('/membership/upgrade', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const keys = Object.keys(req.body || {}); if (keys.some(key => !['newMaxMembers', 'idempotencyKey'].includes(key))) return res.status(400).json({ ok: false, error: 'Unknown upgrade fields' }); const newMaxMembers = Number(req.body?.newMaxMembers); const idempotencyKey = String(req.body?.idempotencyKey || ''); if (!Number.isInteger(newMaxMembers) || newMaxMembers <= 0 || !idempotencyKey) return res.status(400).json({ ok: false, error: 'newMaxMembers and idempotencyKey are required' }); const result = await upgradeSquadTier({ userId, newMaxMembers, idempotencyKey }); res.status(200).json({ ok: true, duplicate: result.duplicate, membership: { ...result.membership, id: String(result.membership.id), squad_id: String(result.membership.squad_id), user_id: String(result.membership.user_id) }, price: result.price, tier: result.tier, transactionId: result.transaction ? String(result.transaction.id) : undefined }); }));
router.get('/invitations', asyncRoute(async (req, res) => { const userId = await currentUserId(req); if (!userId) return res.status(404).json({ ok: false, error: 'User not found' }); const result = await query(`SELECT i.id, i.squad_id, i.inviter_user_id, i.status, i.created_at FROM squad_invitations i WHERE i.invitee_user_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC`, [userId]); res.json({ ok: true, invitations: result.rows.map(row => ({ id: String(row.id), squadId: String(row.squad_id), inviterUserId: String(row.inviter_user_id), status: row.status, createdAt: row.created_at })) }); }));
router.post('/invitations', asyncRoute(async (req, res) => { const inviterUserId = await currentUserId(req); if (!inviterUserId) return res.status(404).json({ ok: false, error: 'User not found' }); const squadId = Number(req.body?.squadId); const telegramUserId = String(req.body?.inviteeTelegramUserId || ''); if (!Number.isInteger(squadId) || squadId <= 0 || !telegramUserId) return res.status(400).json({ ok: false, error: 'squadId and inviteeTelegramUserId are required' }); const invitee = await query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramUserId]); if (!invitee.rows[0]) return res.status(404).json({ ok: false, error: 'Invitee user not found' }); const invitation = await createInvitation({ squadId, inviterUserId, inviteeUserId: invitee.rows[0].id }); res.status(201).json({ ok: true, invitation: { ...invitation, id: String(invitation.id), squad_id: String(invitation.squad_id), invitee_user_id: String(invitation.invitee_user_id) } }); }));
router.post('/invitations/:id/accept', asyncRoute(async (req, res) => { const inviteeUserId = await currentUserId(req); if (!inviteeUserId) return res.status(404).json({ ok: false, error: 'User not found' }); const invitationId = Number(req.params.id); if (!Number.isInteger(invitationId) || invitationId <= 0) return res.status(400).json({ ok: false, error: 'Invalid invitation id' }); const membership = await acceptInvitation({ invitationId, inviteeUserId }); res.status(201).json({ ok: true, membership: { ...membership, id: String(membership.id), squad_id: String(membership.squad_id), user_id: String(membership.user_id) } }); }));

module.exports = router;