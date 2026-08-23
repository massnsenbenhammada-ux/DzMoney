const TELEGRAM_API = 'https://api.telegram.org';

function requireValue(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
}

async function defaultRequest(url) {
  const response = await fetch(url);
  return response.json();
}

async function isTelegramChannelMember({ botToken, channel, userId, request = defaultRequest }) {
  requireValue(botToken, 'botToken');
  requireValue(channel, 'channel');
  requireValue(userId, 'userId');
  const url = `${TELEGRAM_API}/bot${encodeURIComponent(botToken)}/getChatMember?chat_id=${encodeURIComponent(channel)}&user_id=${encodeURIComponent(userId)}`;
  const response = await request(url);
  if (!response?.ok || !response.result) return false;
  const { status, is_member: isMember } = response.result;
  return ['creator', 'administrator', 'member'].includes(status) || (status === 'restricted' && isMember === true);
}

module.exports = { isTelegramChannelMember };
