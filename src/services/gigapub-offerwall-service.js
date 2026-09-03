const crypto = require('crypto');

const GIGAPUB_PROJECT_ID = String(process.env.GIGAPUB_PROJECT_ID || '7958');
const GIGAPUB_SECRET_KEY = String(process.env.GIGAPUB_SECRET_KEY || '');

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return String(value);
}

function amountText(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value) && !Number.isSafeInteger(Math.trunc(value))) {
    throw new Error('GigaPub amount must be a safe numeric value');
  }
  const text = required(value, 'amount');
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error('GigaPub amount must be a non-negative decimal');
  return text;
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function buildRewardHash({ rewardId, userId, projectId, amount }, secretKey) {
  return sha1(`${required(userId, 'userId')}:${required(projectId, 'projectId')}:${required(rewardId, 'rewardId')}:${amountText(amount)}:${required(secretKey, 'secretKey')}`);
}

function buildConfirmationHash({ rewardId, userId, projectId, amount }, secretKey) {
  return sha1(`${required(userId, 'userId')}:${required(projectId, 'projectId')}:${required(rewardId, 'rewardId')}:${amountText(amount)}:confirm:${required(secretKey, 'secretKey')}`);
}

function verifyRewardClaim(payload, config = {}) {
  const projectId = String(config.projectId || GIGAPUB_PROJECT_ID);
  const secretKey = String(config.secretKey || GIGAPUB_SECRET_KEY);
  if (!secretKey) throw new Error('GigaPub secret key is not configured');
  const actualProjectId = required(payload?.projectId, 'projectId');
  if (actualProjectId !== projectId) throw new Error('GigaPub project mismatch');
  const expectedHash = buildRewardHash(payload, secretKey);
  if (typeof payload.hash !== 'string' || payload.hash.length !== expectedHash.length || !crypto.timingSafeEqual(Buffer.from(payload.hash), Buffer.from(expectedHash))) {
    throw new Error('Invalid GigaPub reward hash');
  }
  return { verified: true };
}

module.exports = { GIGAPUB_PROJECT_ID, GIGAPUB_SECRET_KEY, buildRewardHash, buildConfirmationHash, verifyRewardClaim };
