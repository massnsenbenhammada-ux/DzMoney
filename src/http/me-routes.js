const express = require('express');
const walletService = require('../services/wallet-service');
const { telegramAuth } = require('./telegram-auth');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(telegramAuth);

router.get('/', asyncRoute(async (req, res) => {
  const telegramUser = req.telegramUser;
  const user = await walletService.createUser({
    telegramUserId: String(telegramUser.id),
    username: telegramUser.username || null,
    firstName: telegramUser.first_name || null,
    photoUrl: telegramUser.photo_url || null
  });

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
      referralCode: user.referral_code
    },
    balances
  });
}));

module.exports = router;
