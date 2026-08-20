const { withTransaction, query } = require('../db/pool');

const INTERNAL_CURRENCIES = ['COIN', 'DZX', 'DZP'];
const ACTIVITY_REWARD_SOURCES = ['advertisement', 'task', 'referral', 'reward_pool', 'promo'];
const TON_DZX = 10000;
const TON_COIN = 10000000;
const DZX_COIN = 1000;
const DZP_COIN = 10000;
const DZP_DZX = 10;

function positiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  if (!result.rowCount) return fallback;
  const n = Number(result.rows[0].value);
  return Number.isFinite(n) ? n : fallback;
}

async function getEconomySettings() {
  const result = await query(
    `SELECT key, value FROM admin_settings
     WHERE key LIKE 'economy.%' OR key LIKE 'activity.%' OR key LIKE 'reward_pool.%' OR key LIKE 'withdrawal.%'
     ORDER BY key`
  );
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

async function walletForUpdate(client, userId, currency) {
  if (!userId) throw new Error('userId is required');
  if (!INTERNAL_CURRENCIES.includes(currency)) throw new Error('Unsupported internal currency');
  const result = await client.query(
    `SELECT id, balance, earned_dzp, converted_dzp, purchased_dzp FROM wallet_accounts
     WHERE user_id = $1 AND currency = $2 FOR UPDATE`, [userId, currency]
  );
  if (!result.rowCount) throw new Error(`Wallet ${currency} not provisioned`);
  return result.rows[0];
}

async function applyMovement(client, { userId, currency, amount, source, dzpBucket = null }) {
  const wallet = await walletForUpdate(client, userId, currency);
  const before = Number(wallet.balance);
  const delta = Number(amount);
  const after = before + delta;
  if (after < -1e-9) throw new Error(`Insufficient ${currency} balance`);
  const updates = ['balance = $1', 'updated_at = NOW()'];
  const params = [after, wallet.id];
  if (currency === 'DZP' && delta > 0 && dzpBucket) {
    if (!['earned_dzp', 'converted_dzp', 'purchased_dzp'].includes(dzpBucket)) throw new Error('Invalid DZP source bucket');
    updates.push(`${dzpBucket} = ${dzpBucket} + $3`);
    params.push(delta);
  }
  await client.query(`UPDATE wallet_accounts SET ${updates.join(', ')} WHERE id = $2`, params);
  return { walletId: wallet.id, currency, amount: delta, before, after, source };
}

async function createTransaction(client, { idempotencyKey, userId, type, metadata }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!userId) throw new Error('userId is required');
  const inserted = await client.query(
    `INSERT INTO ledger_transactions (idempotency_key, user_id, transaction_type, metadata)
     VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
    [idempotencyKey, userId, type, metadata || {}]
  );
  if (inserted.rowCount) return { transaction: inserted.rows[0], duplicate: false };
  const existing = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [idempotencyKey]);
  if (!existing.rowCount) throw new Error('Unable to resolve idempotent transaction');
  return { transaction: existing.rows[0], duplicate: true };
}

async function postEconomyTransactionOnClient(client, { idempotencyKey, userId, type, movements, metadata = {} }) {
  if (!userId) throw new Error('userId is required');
  if (!Array.isArray(movements) || movements.length === 0) throw new Error('movements are required');
  const created = await createTransaction(client, { idempotencyKey, userId, type, metadata });
  if (created.duplicate) return created;
  const entries = [];
  for (const movement of movements) {
    if (!INTERNAL_CURRENCIES.includes(movement.currency)) throw new Error('Unsupported internal currency');
    if (!Number.isFinite(Number(movement.amount)) || Number(movement.amount) === 0) throw new Error('Invalid economy movement amount');
    const entry = await applyMovement(client, { userId, ...movement });
    const row = await client.query(
      `INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source || null, entry.currency]
    );
    entries.push(row.rows[0]);
  }
  return { transaction: created.transaction, entries, duplicate: false };
}

async function postEconomyTransaction(args) {
  return withTransaction(client => postEconomyTransactionOnClient(client, args));
}

function normalizeActivityReward({ source, coin, dzx, dzp, modifiers }) {
  if (!ACTIVITY_REWARD_SOURCES.includes(source)) throw new Error('Invalid activity reward source');
  const baseReward = { coin: Number(coin), dzx: Number(dzx), dzp: Number(dzp) };
  for (const [currency, amount] of Object.entries(baseReward)) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`${currency} must be a non-negative number`);
  }
  if (baseReward.coin === 0 && baseReward.dzx === 0 && baseReward.dzp === 0) throw new Error('At least one reward currency is required');
  if (!Array.isArray(modifiers)) throw new Error('modifiers must be an array');
  let multiplier = 1;
  const normalizedModifiers = [];
  for (const modifier of modifiers) {
    if (!modifier || modifier.type !== 'squad') throw new Error('Unsupported reward modifier');
    const rate = Number(modifier.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new Error('Invalid squad modifier rate');
    multiplier *= 1 + rate;
    normalizedModifiers.push({ type: 'squad', rate });
  }
  const reward = {
    coin: baseReward.coin * multiplier,
    dzx: baseReward.dzx * multiplier,
    dzp: baseReward.dzp * multiplier,
  };
  return { baseReward, reward, normalizedModifiers };
}

async function creditActivityRewardOnClient(client, args) {
  const { idempotencyKey, userId, source = 'advertisement', coin = 0, dzx = 0, dzp = 0, modifiers = [] } = args;
  const { baseReward, reward, normalizedModifiers } = normalizeActivityReward({ source, coin, dzx, dzp, modifiers });
  const movements = [];
  if (reward.coin > 0) movements.push({ currency: 'COIN', amount: reward.coin, source });
  if (reward.dzx > 0) movements.push({ currency: 'DZX', amount: reward.dzx, source });
  if (reward.dzp > 0) movements.push({ currency: 'DZP', amount: reward.dzp, source, dzpBucket: 'earned_dzp' });
  return postEconomyTransactionOnClient(client, {
    idempotencyKey, userId, type: 'REWARD',
    metadata: { source, base_reward: baseReward, final_reward: reward, modifiers: normalizedModifiers },
    movements,
  });
}

async function creditActivityReward(args) {
  return withTransaction(client => creditActivityRewardOnClient(client, args));
}

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
    for (const entry of [
      await applyMovement(client, { userId, currency: 'COIN', amount: -amount, source: 'conversion' }),
      await applyMovement(client, { userId, currency: 'DZP', amount: dzp, source: 'conversion', dzpBucket: 'converted_dzp' }),
    ]) {
      const row = await client.query(`INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source, entry.currency]);
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
    for (const entry of [
      await applyMovement(client, { userId, currency: 'DZX', amount: -amount, source: 'conversion' }),
      await applyMovement(client, { userId, currency: 'DZP', amount: dzp, source: 'conversion', dzpBucket: 'converted_dzp' }),
    ]) {
      const row = await client.query(`INSERT INTO ledger_entries (transaction_id, wallet_account_id, amount, balance_before, balance_after, source, currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [created.transaction.id, entry.walletId, entry.amount, entry.before, entry.after, entry.source, entry.currency]);
      entries.push(row.rows[0]);
    }
    return { transaction: created.transaction, entries, duplicate: false, dzp };
  });
}

function tonToDZX(ton) { return positiveNumber(ton, 'ton') * TON_DZX; }
function dzxToTON(dzx) { return positiveNumber(dzx, 'dzx') / TON_DZX; }

module.exports = {
  INTERNAL_CURRENCIES, ACTIVITY_REWARD_SOURCES, TON_DZX, TON_COIN, DZX_COIN, DZP_COIN, DZP_DZX,
  getEconomySettings, postEconomyTransaction, postEconomyTransactionOnClient,
  creditActivityReward, creditActivityRewardOnClient, convertCoinToDzp, convertDzxToDzp, tonToDZX, dzxToTON,
};
