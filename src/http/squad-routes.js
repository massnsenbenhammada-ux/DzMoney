const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { createInvitation, acceptInvitation, getPaidMembershipTiers, purchasePaidMembership } = require('../services/squad-membership-service');
const { getCurrentUserSquadState } = require('../services/squad-daily-state-service');
const { startRotatedAdvertisementEventOnClient } = require('../services/ad-event-service');
const { finalizeStandardAdvertisement } = require('../services/task-advertisement-service');
const providerRegistry = require('../services/ad-provider-registry-runtime');

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
  const membership = await query(`SELECT s.id AS squad_id, s.owner_user_id, COUNT(sm2.id) FILTER (WHERE sm2.status <> 'cancelled') AS member_count, sm.status AS membership_status FROM squad_memberships sm JOIN squads s ON s.id = sm.squad_id LEFT JOIN squad_memberships sm2 ON sm2.squad_id = s.id WHERE sm.user_id = $1 AND sm.status <> 'cancelled' GROUP BY s.id, s.owner_user_id, sm.status`, [userId]);
  if (!membership.rows[0]) return res.json({ ok: true, squad: null });
  const row = membership.rows[0];
  res.json({ ok: true, squad: { id: String(row.squad_id), ownerUserId: String(row.owner_user_id), memberCount: Number(row.member_count), membershipStatus: row.membership_status, isOwner: Number(row.owner_user_id) === Number(userId) } });
}));

router.get('/daily-state', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const state = await getCurrentUserSquadState({ userId });
  res.json({ ok: true, state });
}));

router.post('/ads/start', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const idempotencyKey = String(req.body?.idempotencyKey || '');
  if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'idempotencyKey is required' });
  const membership = await query("SELECT 1 FROM squad_memberships WHERE user_id=$1 AND status IN ('active','pending') LIMIT 1", [userId]);
  if (!membership.rowCount) return res.status(409).json({ ok: false, error: 'Active Squad membership is required' });
  const result = await withTransaction(client => startRotatedAdvertisementEventOnClient(client, { userId, context: 'squad', idempotencyKey, metadata: { squad_ad: true }, providerRegistry }));
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, adEventId: String(result.adEvent.id), externalAdId: String(result.adEvent.external_ad_id), providerId: result.providerId });
}));

router.get('/ads/status', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const adEventId = Number(req.query.adEventId);
  if (!Number.isInteger(adEventId) || adEventId <= 0) return res.status(400).json({ ok: false, error: 'Invalid adEventId' });
  const result = await query('SELECT id,verified,completed_at,metadata FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context=$3', [adEventId, userId, 'squad']);
  if (!result.rowCount) return res.status(404).json({ ok: false, error: 'Squad advertisement event not found' });
  const event = result.rows[0];
  res.json({ ok: true, adEventId: String(event.id), verified: event.verified === true, completedAt: event.completed_at, rewarded: Boolean(event.metadata?.reward_transaction_id) });
}));

router.get('/membership-tiers', asyncRoute(async (req, res) => {
  const tiers = await getPaidMembershipTiers({ query: (...args) => query(...args) });
  res.json({ ok: true, tiers });
}));

router.post('/membership/purchase', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const keys = Object.keys(req.body || {});
  if (keys.some(key => !['maxMembers', 'idempotencyKey'].includes(key))) return res.status(400).json({ ok: false, error: 'Unknown purchase fields' });
  const maxMembers = Number(req.body?.maxMembers);
  const idempotencyKey = String(req.body?.idempotencyKey || '');
  if (!Number.isInteger(maxMembers) || maxMembers <= 0 || !idempotencyKey) return res.status(400).json({ ok: false, error: 'maxMembers and idempotencyKey are required' });
  const result = await purchasePaidMembership({ userId, maxMembers, idempotencyKey });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, membership: { ...result.membership, id: String(result.membership.id), squad_id: String(result.membership.squad_id), user_id: String(result.membership.user_id) }, price: result.price, tier: result.tier, transactionId: result.transaction ? String(result.transaction.id) : undefined });
}));

router.get('/invitations', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await query(`SELECT i.id, i.squad_id, i.inviter_user_id, i.status, i.created_at FROM squad_invitations i WHERE i.invitee_user_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC`, [userId]);
  res.json({ ok: true, invitations: result.rows.map(row => ({ id: String(row.id), squadId: String(row.squad_id), inviterUserId: String(row.inviter_user_id), status: row.status, createdAt: row.created_at })) });
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
