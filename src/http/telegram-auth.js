const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 60 * 60;
const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

function verifyTelegramInitData(initData) {
  const botToken = BOT_TOKEN();
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isInteger(authDate)) return null;

  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age < -60 || age > MAX_AGE_SECONDS) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const received = Buffer.from(receivedHash, 'hex');
  const calculated = Buffer.from(calculatedHash, 'hex');
  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) return null;

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
  if (!user || user.id === undefined || user.id === null) return null;
  return user;
}

function telegramAuth(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data') || req.body?.initData;
  const user = verifyTelegramInitData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram authentication' });
  req.telegramUser = user;
  next();
}

module.exports = { verifyTelegramInitData, telegramAuth };
