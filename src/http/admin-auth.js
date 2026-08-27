const { telegramAuth } = require('./telegram-auth');

function adminTelegramIds() {
  return new Set(
    String(process.env.ADMIN_TELEGRAM_USER_IDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function adminAuth(req, res, next) {
  return telegramAuth(req, res, () => {
    const id = String(req.telegramUser?.id || '');
    if (!id || !adminTelegramIds().has(id)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminTelegramUserId = id;
    next();
  });
}

module.exports = { adminAuth };
