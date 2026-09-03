const express = require('express');
const { withTransaction, query } = require('../db/pool');
const { telegramAuth } = require('./telegram-auth');
const { postEconomyTransactionOnClient } = require('../services/economy-service');
const { GIGAPUB_PROJECT_ID, GIGAPUB_SECRET_KEY, verifyRewardClaim, buildConfirmationHash } = require('../services/gigapub-offerwall-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

function normalizeClaim(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('request body must be an object'), { statusCode: 400 });
  const allowed = new Set(['rewardId', 'userId', 'projectId', 'amount', 'hash']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw Object.assign(new Error('unknown request field'), { statusCode: 400 });
  return { rewardId: String(body.rewardId || ''), userId: String(body.userId || ''), projectId: String(body.projectId || ''), amount: body.amount, hash: body.hash };
}

router.post('/reward', asyncRoute(async (req, res) => {
  const claim = normalizeClaim(req.body);
  if (!claim.rewardId || !claim.userId || !claim.projectId || claim.amount === undefined || typeof claim.hash !== 'string') return res.status(400).json({ ok: false, error: 'Invalid GigaPub reward claim' });
  if (claim.userId !== String(req.telegramUser.id)) return res.status(403).json({ ok: false, error: 'GigaPub user does not match Telegram user' });
  verifyRewardClaim(claim, { projectId: GIGAPUB_PROJECT_ID, secretKey: GIGAPUB_SECRET_KEY });

  const result = await withTransaction(async client => {
    const user = await client.query('SELECT id FROM users WHERE telegram_user_id = $1 FOR SHARE', [claim.userId]);
    if (!user.rowCount) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    const idempotencyKey = `gigapub:offerwall:${claim.rewardId}`;
    const transaction = await postEconomyTransactionOnClient(client, {
      idempotencyKey,
      userId: user.rows[0].id,
      type: 'REWARD',
      metadata: { source: 'gigapub_offerwall', provider: 'gigapub', project_id: claim.projectId, reward_id: claim.rewardId, gigapub_user_id: claim.userId, gigapub_amount: String(claim.amount) },
      movements: [{ currency: 'COIN', amount: claim.amount, source: 'advertisement' }]
    });
    return { transaction };
  });

  const confirmationHash = buildConfirmationHash(claim, GIGAPUB_SECRET_KEY);
  res.json({ ok: true, success: true, duplicate: result.transaction.duplicate, confirmationHash });
}));

router.get('/status', asyncRoute(async (req, res) => {
  const result = await query('SELECT 1 AS ok');
  res.json({ ok: result.rows[0].ok === 1, provider: 'gigapub', projectId: GIGAPUB_PROJECT_ID, configured: Boolean(GIGAPUB_SECRET_KEY) });
}));

module.exports = { createGigaPubOfferWallRouter: () => router };
