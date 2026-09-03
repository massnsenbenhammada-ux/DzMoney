const express = require('express');
const { query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const gaming = require('../services/gaming-service');
const { verifyWithProvider } = require('../services/ad-provider-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(telegramAuth);

async function currentUserId(req) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id=$1', [String(req.telegramUser.id)]);
  return result.rows[0]?.id || null;
}

function idempotency(req) {
  const key = String(req.body?.idempotencyKey || '');
  if (!key || key.length > 160) throw Object.assign(new Error('idempotencyKey is required'), { statusCode: 400 });
  return key;
}

function publicSession(session) {
  if (!session) return null;
  return { ...session, board: (session.board || []).map(tile => tile.revealed ? tile : { id:tile.id, revealed:false, reward:{} }) };
}

function publicGamingState(state) {
  return { ...state, activeSession: publicSession(state.activeSession) };
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  res.json({ ok: true, gaming: publicGamingState(await gaming.getGamingState({ userId })) });
}));

router.post('/spin', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.spin({ userId, idempotencyKey: idempotency(req) });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, result: result.result, transactionId: result.transaction?.id ? String(result.transaction.id) : null });
}));

router.post('/digging/start', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.startDigging({ userId });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, session: publicSession(result.session) });
}));

router.post('/digging/reveal', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.revealDiggingTile({ userId, sessionId: req.body?.sessionId, tileId: req.body?.tileId });
  res.json({ ok: true, duplicate: result.duplicate, tile: result.tile, session: publicSession(result.session), transactionId: result.transaction?.id ? String(result.transaction.id) : null });
}));

router.post('/ads/start', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const result = await gaming.startGamingAdvertisement({ userId, game: String(req.body?.game || ''), idempotencyKey: idempotency(req), providerRegistry: req.app.locals.adProviderRegistry });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate, adEventId: String(result.adEvent.id), externalAdId: result.adEvent.external_ad_id, providerId: result.providerId });
}));

router.post('/ads/complete', asyncRoute(async (req, res) => {
  const userId = await currentUserId(req);
  if (!userId) return res.status(404).json({ ok: false, error: 'User not found' });
  const adEventId = String(req.body?.adEventId || '');
  if (!adEventId) throw Object.assign(new Error('adEventId is required'), { statusCode: 400 });
  const event = await query("SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context='gaming'", [adEventId, userId]);
  if (!event.rowCount) throw Object.assign(new Error('Gaming advertisement event not found'), { statusCode: 404 });
  const providerId = event.rows[0].metadata?.provider_id;
  if (!providerId) throw Object.assign(new Error('Advertisement provider is not recorded'), { statusCode: 400 });
  const verification = await verifyWithProvider(req.app.locals.adProviderRegistry, {
    context: 'gaming', providerId, payload: { adEventId, userId }
  });
  const result = await gaming.finalizeGamingAdvertisement({
    userId, adEventId, providerReference: verification.verification.reference,
    verificationMetadata: verification.verification.metadata
  });
  res.json({ ok: true, duplicate: result.duplicate, rewarded: result.rewarded, reward: result.reward || null, resourceGranted: result.resourceGranted || null, progress: result.progress ?? null });
}));

module.exports = router;
