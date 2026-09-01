const express = require('express');
const { adminAuth } = require('./admin-auth');
const { createWeeklyChallenge, settleWeeklyChallenge, VALID_SCOPES } = require('../services/squad-weekly-challenge-service');

function createAdminSquadChallengeRouter() {
  const router = express.Router();
  router.use(adminAuth);

  router.post('/challenges', async (req, res, next) => {
    try {
      const { squadId, name, scope, scopeValue = null, rewardCurrency, rewardAmount } = req.body || {};
      const challenge = await createWeeklyChallenge({ squadId: Number(squadId), name, scope, scopeValue, rewardCurrency, rewardAmount, adminTelegramUserId: req.adminTelegramUserId });
      res.status(201).json({ ok: true, challenge: serializeChallenge(challenge) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/challenges/:id/settle', async (req, res, next) => {
    try {
      const result = await settleWeeklyChallenge({ challengeId: Number(req.params.id) });
      res.json({ ok: true, duplicate: result.duplicate, challenge: serializeChallenge(result.challenge), rewards: result.rewards });
    } catch (error) {
      next(error);
    }
  });

  router.get('/challenges/scopes', (_req, res) => res.json({ ok: true, scopes: VALID_SCOPES }));
  return router;
}

function serializeChallenge(challenge) {
  return {
    id: String(challenge.id), squadId: String(challenge.squad_id), name: challenge.name, scope: challenge.scope_type,
    scopeValue: challenge.scope_value, rewardCurrency: challenge.reward_currency, rewardAmount: String(challenge.reward_amount),
    startsAt: challenge.starts_at, endsAt: challenge.ends_at, status: challenge.status, configSnapshot: challenge.config_snapshot, settledAt: challenge.settled_at
  };
}

module.exports = { createAdminSquadChallengeRouter };
