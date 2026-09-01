const { withTransaction, query } = require('../db/pool');

const INTERNAL_CURRENCIES = ['COIN', 'DZX', 'DZP'];
const ACTIVITY_REWARD_SOURCES = ['advertisement', 'task', 'referral', 'reward_pool', 'promo'];
const TON_DZX = 10000;
const TON_COIN = 10000000;
const DZX_COIN = 1000;
const DZP_COIN = 10000;
const DZP_DZX = 10;
const NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const NUMERIC_SCALE = 9;
const DECIMAL_SCALE = 1000000000n;

function numericInput(value, name, { allowZero = true } = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`${name} must be a finite safe numeric value`);
  }
  const text = String(value).trim();
  if (!NUMERIC_PATTERN.test(text)) throw new Error(`${name} must be a valid decimal number`);
  const [integerPart, fractionPart = ''] = text.replace('-', '').split('.');
  if (integerPart.replace(/^0+/, '').length > 21 || fractionPart.length > NUMERIC_SCALE) throw new Error(`${name} exceeds NUMERIC(30,9) precision`);
  const isZero = /^0+(?:\.0*)?$/.test(text);
  if (!allowZero && isZero) throw new Error(`${name} must be non-zero`);
  return text;
}

function positiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

function decimalToScaled(value, name) {
  const text = numericInput(value, name);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [integerPart, fractionPart = ''] = unsigned.split('.');
  const fraction = fractionPart.padEnd(NUMERIC_SCALE, '0');
  const scaled = BigInt(integerPart || '0') * DECIMAL_SCALE + BigInt(fraction || '0');
  return negative ? -scaled : scaled;
}

function scaledToDecimal(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integerPart = absolute / DECIMAL_SCALE;
  const fractionPart = String(absolute % DECIMAL_SCALE).padStart(NUMERIC_SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integerPart}${fractionPart ? `.${fractionPart}` : ''}`;
}

function multiplyScaled(left, right) {
  const product = left * right;
  const quotient = product / DECIMAL_SCALE;
  const remainder = product % DECIMAL_SCALE;
  if (remainder !== 0n && (remainder < 0n ? -remainder : remainder) * 2n >= DECIMAL_SCALE) return quotient + (product < 0n ? -1n : 1n);
  return quotient;
}

function multiplyRatioScaled(amount, numerator, denominator) {
  if (denominator <= 0n) throw new Error('Ratio denominator must be positive');
  const product = amount * numerator;
  const quotient = product / denominator;
  const remainder = product % denominator;
  if (remainder !== 0n && (remainder < 0n ? -remainder : remainder) * 2n >= denominator) return quotient + (product < 0n ? -1n : 1n);
  return quotient;
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const n = Number(result.rows[0].value);
  return Number.isFinite(n) ? n : fallback;
}

async function getEconomySettings() {
  const result = await query(`SELECT key, value FROM admin_settings WHERE key LIKE 'economy.%' OR key LIKE 'activity.%' OR key LIKE 'reward_pool.%' OR key LIKE 'withdrawal.%' ORDER BY key`);
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

async function walletForUpdate(client, userId, currency) {
  if (!userId) throw new Error('userId is required');
  if (!INTERNAL_CURRENCIES.includes(currency)) throw new Error('Unsupported internal currency');
  const result = await client.query(`SELECT id, balance, earned_dzp, converted_dzp, purchased_dzp FROM wallet_accounts WHERE user_id = $1 AND currency = $2 FOR UPDATE`, [userId, currency]);
  if (!result.rowCount) throw new Error(`Wallet ${currency} not provisioned`);
  return result.rows[0];
}

async function applyMovement(client, { userId, currency, amount, source, dzpBucket = null }) {
  const wallet = await walletForUpdate(client, userId, currency);
  const delta = numericInput(amount, 'amount', { allowZero: false });
  const updates = ['balance = balance + $1::numeric', 'updated_at = NOW()'];
  const params = [delta, wallet.id];
  if (currency === 'DZP' && !delta.startsWith('-') && !/^0+(?:\.0*)?$/.test(delta) && dzpBucket) {
    if (!['earned_dzp', 'converted_dzp', 'purchased_dzp'].includes(dzpBucket)) throw new Error('Invalid DZP source bucket');
    updates.push(`${dzpBucket} = ${dzpBucket} + $1::numeric`);
  }
  const updated = await client.query(`UPDATE wallet_accounts SET ${updates.join(', ')} WHERE id = $2 AND balance + $1::numeric >= 0 RETURNING balance`, params);
  if (!updated.rowCount) throw new Error(`Insufficient ${currency} balance`);
  return { walletId: wallet.id, currency, amount: delta, before: wallet.balance, after: updated.rows[0].balance, source };
}

async function createTransaction(client, { idempotencyKey, userId, type, metadata }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!userId) throw new Error('userId is required');
  const inserted = await client.query(`INSERT INTO ledger_transactions (idempotency_key, user_id, transaction_type, metadata) VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [idempotencyKey, userId, type, metadata || {}]);
  if (inserted.rowCount) return { transaction: inserted.rows[0], duplicate: false };
  const existing = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [idempotencyKey]);
  if (!existing.rowCount) throw new Error('Unable to resolve idempotent transaction');
  const transaction = existing.rows[0];
  if (String(transaction.user_id) !== String(userId)) throw new Error('Idempotency key ownership mismatch');
  if (transaction.transaction_type !== type) throw new Error('Idempotency key operation mismatch');
  return { transaction, duplicate: true };
}

async function postEconomyTransactionOnClient(client, { idempotencyKey, userId, type, movements, metadata = {} }) {
  if (!userId) throw new Error('userId is required');
  if (!Array.isArray(movements)) throw new Error('movements are required');
  const created = await createTransaction(client, { idempotencyKey, userId, type, metadata });
  if (created.duplicate) return created;
  const entries = [];
  for (const movement of movements) {
    if (!INTERNAL_CURRENCIES.includes(movement.currency)) throw new Error('Unsupported internal currency');
    numericInput(movement.amount, 'movement amount', { allowZero: false });
    const entry = await applyMovement(client, { userId, ...movement });
    const row = await client.query(`INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source || null, entry.currency]);
    entries.push(row.rows[0]);
  }
  return { transaction: created.transaction, entries, duplicate: false };
}

async function postEconomyTransaction(args) { return withTransaction(client => postEconomyTransactionOnClient(client, args)); }

function normalizeActivityReward({ source, coin, dzx, dzp, modifiers }) {
  if (!ACTIVITY_REWARD_SOURCES.includes(source)) throw new Error('Invalid activity reward source');
  const baseReward = { coin: numericInput(coin, 'coin'), dzx: numericInput(dzx, 'dzx'), dzp: numericInput(dzp, 'dzp') };
  const baseScaled = Object.fromEntries(Object.entries(baseReward).map(([currency, amount]) => [currency, decimalToScaled(amount, currency)]));
  for (const [currency, amount] of Object.entries(baseScaled)) if (amount < 0n) throw new Error(`${currency} must be a non-negative number`);
  if (baseScaled.coin === 0n && baseScaled.dzx === 0n && baseScaled.dzp === 0n) throw new Error('At least one reward currency is required');
  if (!Array.isArray(modifiers)) throw new Error('modifiers must be an array');
  let multiplier = DECIMAL_SCALE;
  const normalizedModifiers = [];
  for (const modifier of modifiers) {
    if (!modifier || modifier.type !== 'squad') throw new Error('Unsupported reward modifier');
    const rate = numericInput(modifier.rate, 'squad modifier rate');
    const rateScaled = decimalToScaled(rate, 'squad modifier rate');
    if (rateScaled < 0n) throw new Error('Invalid squad modifier rate');
    multiplier = multiplyScaled(multiplier, DECIMAL_SCALE + rateScaled);
    normalizedModifiers.push({ type: 'squad', rate });
  }
  const reward = Object.fromEntries(Object.entries(baseScaled).map(([currency, amount]) => [currency, currency === 'dzp' ? scaledToDecimal(amount) : scaledToDecimal(multiplyScaled(amount, multiplier))]));
  return { baseReward, reward, normalizedModifiers };
}

async function creditActivityRewardOnClient(client, args) {
  const { idempotencyKey, userId, source = 'advertisement', coin = 0, dzx = 0, dzp = 0, modifiers = [], qualifyingVerifiedActivity = false, activityDay = null, activityType = null, activityContext = null } = args;
  let effectiveModifiers = modifiers;
  if (qualifyingVerifiedActivity && !modifiers.some(modifier => modifier?.type === 'squad')) {
    const { getApplicableSquadModifierOnClient } = require('./squad-daily-state-service');
    const applied = await getApplicableSquadModifierOnClient(client, { userId, day: activityDay });
    if (applied.rate !== '0') effectiveModifiers = [...modifiers, { type: 'squad', rate: applied.rate }];
  }
  const { baseReward, reward, normalizedModifiers } = normalizeActivityReward({ source, coin, dzx, dzp, modifiers: effectiveModifiers });
  const movements = [];
  if (reward.coin !== '0') movements.push({ currency: 'COIN', amount: reward.coin, source });
  if (reward.dzx !== '0') movements.push({ currency: 'DZX', amount: reward.dzx, source });
  if (reward.dzp !== '0') movements.push({ currency: 'DZP', amount: reward.dzp, source, dzpBucket: 'earned_dzp' });
  return postEconomyTransactionOnClient(client, { idempotencyKey, userId, type: 'REWARD', metadata: { source, ...(activityType ? { activity_type: activityType } : {}), ...(activityContext ? { activity_context: activityContext } : {}), base_reward: baseReward, final_reward: reward, modifiers: normalizedModifiers }, movements });
}

async function creditActivityReward(args) { return withTransaction(client => creditActivityRewardOnClient(client, args)); }

async function convertCoinToDzp({ idempotencyKey, userId, coin }) {
  const amount = positiveNumber(coin, 'coin');
  return withTransaction(async client => {
    const created = await createTransaction(client, { idempotencyKey, userId, type: 'CONVERSION', metadata: { direction: 'COIN_TO_DZP' } });
    if (created.duplicate) return created;
    const rate = await settingNumber(client, 'economy.coin_per_dzp', DZP_COIN);
    if (amount < rate) throw new Error(`Minimum conversion is ${rate} COIN`);
    const dzp = amount / rate;
    if (!Number.isInteger(dzp)) throw new Error('COIN amount must match the configured DZP conversion rate');
    const entries = [];
    for (const entry of [await applyMovement(client, { userId, currency: 'COIN', amount: -amount, source: 'conversion' }), await applyMovement(client, { userId, currency: 'DZP', amount: dzp, source: 'conversion', dzpBucket: 'converted_dzp' })]) {
      const row = await client.query(`INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source, entry.currency]);
      entries.push(row.rows[0]);
    }
    return { transaction: created.transaction, entries, duplicate: false, dzp };
  });
}

async function convertDzxToDzp({ idempotencyKey, userId, dzx }) {
  const amount = positiveNumber(dzx, 'dzx');
  return withTransaction(async client => {
    const created = await createTransaction(client, { idempotencyKey, userId, type: 'CONVERSION', metadata: { direction: 'DZX_TO_DZP' } });
    if (created.duplicate) return created;
    const rate = await settingNumber(client, 'economy.dzx_per_dzp', DZP_DZX);
    if (amount < rate) throw new Error(`Minimum conversion is ${rate} DZX`);
    const dzp = amount / rate;
    if (!Number.isInteger(dzp)) throw new Error('DZX amount must match the configured DZP conversion rate');
    const entries = [];
    for (const entry of [await applyMovement(client, { userId, currency: 'DZX', amount: -amount, source: 'conversion' }), await applyMovement(client, { userId, currency: 'DZP', amount: dzp, source: 'conversion', dzpBucket: 'converted_dzp' })]) {
      const row = await client.query(`INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source, entry.currency]);
      entries.push(row.rows[0]);
    }
    return { transaction: created.transaction, entries, duplicate: false, dzp };
  });
}

function tonToDZX(ton) { return positiveNumber(ton, 'ton') * TON_DZX; }
function dzxToTON(dzx) { return positiveNumber(dzx, 'dzx') / TON_DZX; }

module.exports = { INTERNAL_CURRENCIES, ACTIVITY_REWARD_SOURCES, TON_DZX, TON_COIN, DZX_COIN, DZP_COIN, DZP_DZX, getEconomySettings, postEconomyTransaction, postEconomyTransactionOnClient, creditActivityReward, creditActivityRewardOnClient, convertCoinToDzp, convertDzxToDzp, tonToDZX, dzxToTON, decimalToScaled, scaledToDecimal, multiplyScaled, multiplyRatioScaled };
