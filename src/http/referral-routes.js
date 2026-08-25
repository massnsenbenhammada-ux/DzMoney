const express = require('express');
const walletService = require('../services/wallet-service');
const { telegramAuth } = require('./telegram-auth');
const { referralService, referralCode } = require('../services/referral-service');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(telegramAuth);

router.get('/', asyncRoute(async (req, res) => {
  const user = await walletService.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
  const count = await referralService.getQualifiedCount(user.id);
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  res.json({ ok: true, referralCode: referralCode(user.id), referralLink: username ? `https://t.me/${username}?startapp=${referralCode(user.id)}` : null, qualifiedCount: count });
}));

router.post('/attribute', asyncRoute(async (req, res) => {
  const user = await walletService.createUser({ telegramUserId: String(req.telegramUser.id), username: req.telegramUser.username || null, firstName: req.telegramUser.first_name || null, photoUrl: req.telegramUser.photo_url || null });
  const code = String(req.body?.referralCode || '').trim().toUpperCase();
  const referral = await referralService.attributeByCode({ referredUserId: user.id, code });
  res.status(201).json({ ok: true, referral: { id: String(referral.id), status: referral.status } });
}));

module.exports = router;
