const express = require('express');
const { query } = require('../db/pool');
const walletService = require('../services/wallet-service');
const referralService = require('../services/referral-service');
const { buildReferralLink } = require('../config/telegram');
const { telegramAuth } = require('./telegram-auth');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

async function findExistingUser(telegramUserId) {
  const result = await query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramUserId]);
  return result.rows[0] || null;
}

async function attributeFirstEntry(userId, referralCode) {
  if (!referralCode) return;
  const result = await query('SELECT id FROM users WHERE referral_code = $1', [referralCode]);
  const referrer = result.rows[0];
  if (!referrer || Number(referrer.id) === Number(userId)) return;
  await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: userId });
}

router.get('/', asyncRoute(async (req, res) => {
  const telegramUser = req.telegramUser;
  const telegramUserId = String(telegramUser.id);
  const existingUser = await findExistingUser(telegramUserId);
  const user = await walletService.createUser({
    telegramUserId,
    username: telegramUser.username || null,
    firstName: telegramUser.first_name || null,
    photoUrl: telegramUser.photo_url || null
  });

  if (!existingUser) await attributeFirstEntry(user.id, req.telegramStartParam);

  const wallets = await walletService.getUserWallets(user.id);
  const balances = Object.fromEntries(wallets.map(wallet => [wallet.currency, wallet.balance]));

  res.json({
    ok: true,
    user: {
      id: String(user.id),
      telegramUserId: String(user.telegram_user_id),
      username: user.username,
      firstName: user.first_name,
      photoUrl: user.photo_url,
      referralCode: user.referral_code,
      referralLink: buildReferralLink(user.referral_code)
    },
    balances
  });
}));

module.exports = router;
