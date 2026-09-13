const { query } = require('../db/pool');

async function notifyUser({ userId, message, metadata = {} }) {
  if (!userId || !message) return { attempted: false, delivered: false, reason: 'invalid_input' };
  if (!process.env.BOT_TOKEN) {
    console.warn('[telegram-notification] BOT_TOKEN is not configured', metadata);
    return { attempted: false, delivered: false, reason: 'bot_token_missing' };
  }

  try {
    const result = await query('SELECT telegram_user_id FROM users WHERE id = $1', [userId]);
    const chatId = result.rows[0]?.telegram_user_id;
    if (!chatId) return { attempted: false, delivered: false, reason: 'telegram_user_id_missing' };

    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      console.warn('[telegram-notification] delivery attempt failed', {
        userId,
        status: response.status,
        telegramError: body?.description || 'unknown_error',
        metadata
      });
      return { attempted: true, delivered: false, reason: 'telegram_rejected' };
    }
    return { attempted: true, delivered: true };
  } catch (error) {
    console.warn('[telegram-notification] delivery attempt failed', {
      userId,
      error: error?.message || 'unknown_error',
      metadata
    });
    return { attempted: true, delivered: false, reason: 'delivery_error' };
  }
}

module.exports = { notifyUser };
