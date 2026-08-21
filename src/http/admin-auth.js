function isAdminTelegramUser(telegramUser, adminTelegramUserIds) {
  if (!telegramUser || telegramUser.id === undefined || telegramUser.id === null) return false;
  const configuredIds = String(adminTelegramUserIds || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return configuredIds.includes(String(telegramUser.id));
}

function requireAdmin(req, res, next) {
  if (!isAdminTelegramUser(req.telegramUser, process.env.ADMIN_TELEGRAM_USER_IDS)) {
    return res.status(req.telegramUser ? 403 : 401).json({ error: 'Admin access required' });
  }
  return next();
}

module.exports = { isAdminTelegramUser, requireAdmin };
