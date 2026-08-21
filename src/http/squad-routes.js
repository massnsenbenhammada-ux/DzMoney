const express = require('express');
const squadService = require('../services/squad-service');
const { telegramAuth } = require('./telegram-auth');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.use(telegramAuth);

router.get('/', asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  const membership = await squadService.getMembershipForUser(userId);
  if (!membership) return res.json({ inSquad: false, squad: null });

  const [squad, members, eligibility] = await Promise.all([
    squadService.getSquad(membership.squad_id),
    squadService.getMembers(membership.squad_id),
    squadService.getDailyEligibility({ squadId: membership.squad_id })
  ]);

  const activeMembers = members.filter(member => member.status === 'active');
  return res.json({
    inSquad: true,
    squad: {
      id: squad.id,
      status: squad.status,
      memberCount: members.length,
      activeMemberCount: activeMembers.length,
      activityPercent: eligibility.explanation.activityPercent,
      dailyBonus: eligibility,
      membership
    }
  });
}));

router.get('/goals', asyncRoute(async (req, res) => {
  const membership = await squadService.getMembershipForUser(String(req.telegramUser.id));
  if (!membership) return res.json({ inSquad: false, goals: [] });
  return res.json({ inSquad: true, goals: await squadService.getActiveGoals(membership.squad_id) });
}));

router.get('/goals/:goalId', asyncRoute(async (req, res) => {
  const membership = await squadService.getMembershipForUser(String(req.telegramUser.id));
  if (!membership) return res.status(404).json({ error: 'Squad membership not found' });

  const goal = await squadService.getGoalForUser(req.params.goalId, membership.squad_id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const contribution = await squadService.getGoalContribution({ goalId: goal.id, userId: String(req.telegramUser.id) });
  return res.json({ goal, contribution });
}));

module.exports = router;