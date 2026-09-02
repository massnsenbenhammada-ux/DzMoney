const { withTransaction, query } = require('../db/pool');
const { multiplyRatioScaled, postEconomyTransactionOnClient } = require('./economy-service');

const DEFAULT_ACTIVATION_ADS = 10;
const SCALE = 1000000000n;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function scaledDecimal(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Invalid non-negative decimal');
  const [integerPart, fraction = ''] = text.split('.');
  if (fraction.length > 9) throw new Error('Decimal exceeds NUMERIC(30,9) precision');
  return BigInt(integerPart) * SCALE + BigInt(fraction.padEnd(9, '0'));
}

function decimalFromScaled(value) {
  const integerPart = value / SCALE;
  const fraction = String(value % SCALE).padStart(9, '0').replace(/0+$/, '');
  return `${integerPart}${fraction ? `.${fraction}` : ''}`;
}

async function getActivationTarget(client = null) {
  const result = client
    ? await client.query("SELECT value FROM admin_settings WHERE key='reward_pool.activation_ads'")
    : await query("SELECT value FROM admin_settings WHERE key='reward_pool.activation_ads'");
  return positiveInteger(result.rows[0]?.value, DEFAULT_ACTIVATION_ADS);
}

async function getRewardPoolStatus({ userId }) {
  if (userId === undefined || userId === null || userId === '') throw new Error('userId is required');
  const activationTarget = await getActivationTarget();
  const result = await query(`SELECT COUNT(*)::int AS completed_ads FROM activity_ad_events WHERE user_id=$1 AND context='reward_pool' AND verified=TRUE`, [userId]);
  const completedAds = Number(result.rows[0]?.completed_ads || 0);
  const remainingAds = Math.max(activationTarget - completedAds, 0);
  const activated = completedAds >= activationTarget;
  return { activationTarget, completedAds, remainingAds, activated, locked: !activated };
}

function previousUtcPlusOneDay(now = new Date()) {
  const local = new Date(now.getTime() + 3600000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 86400000);
  return { periodStart: new Date(start.getTime() - 3600000), periodEnd: new Date(start.getTime() + 23 * 3600000) };
}

async function getDailyPool(client) {
  const result = await client.query("SELECT value FROM admin_settings WHERE key='reward_pool.daily_dzx'");
  return result.rows[0]?.value === undefined ? '0' : String(result.rows[0].value);
}

async function settleRewardPool({ periodStart, periodEnd, now = new Date() }) {
  if (!(periodStart instanceof Date) || Number.isNaN(periodStart.getTime())) throw new Error('periodStart is required');
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime()) || periodEnd <= periodStart) throw new Error('periodEnd must be after periodStart');
  return withTransaction(async client => {
    const existing = await client.query('SELECT * FROM reward_pool_distribution_runs WHERE period_start=$1 AND period_end=$2 FOR UPDATE', [periodStart, periodEnd]);
    if (existing.rowCount) {
      const entries = await client.query('SELECT user_id,activity_dzp,reward_dzx FROM reward_pool_distribution_entries WHERE run_id=$1 ORDER BY user_id', [existing.rows[0].id]);
      return { duplicate: true, run: existing.rows[0], rewards: entries.rows };
    }
    const activationTarget = await getActivationTarget(client);
    const poolDzx = String(await getDailyPool(client));
    const activity = await client.query(
      `WITH eligible_users AS (
         SELECT user_id FROM activity_ad_events
         WHERE context='reward_pool' AND verified=TRUE
         GROUP BY user_id HAVING COUNT(*) >= $1
       )
       SELECT lt.user_id, SUM(le.amount)::text AS activity_dzp
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le.transaction_id=lt.id
       JOIN eligible_users eu ON eu.user_id=lt.user_id
       WHERE lt.transaction_type='REWARD' AND le.currency='DZP' AND le.amount > 0
         AND lt.created_at >= $2 AND lt.created_at < $3
         AND lt.metadata->>'source' IN ('task','advertisement')
       GROUP BY lt.user_id HAVING SUM(le.amount) > 0 ORDER BY lt.user_id`,
      [activationTarget, periodStart, periodEnd]
    );
    const total = activity.rows.reduce((sum, row) => sum + scaledDecimal(row.activity_dzp), 0n);
    const pool = scaledDecimal(poolDzx);
    const status = total > 0n && pool > 0n ? 'settled' : 'empty';
    const runResult = await client.query(
      `INSERT INTO reward_pool_distribution_runs(period_start,period_end,pool_dzx,total_activity_dzp,total_weight,status,settled_at)
       VALUES($1,$2,$3::numeric,$4::numeric,$4::numeric,$5,$6) RETURNING *`,
      [periodStart, periodEnd, poolDzx, decimalFromScaled(total), status, now]
    );
    const run = runResult.rows[0];
    if (status === 'empty') return { duplicate: false, run, totalActivityDzp: decimalFromScaled(total), rewards: [] };
    const rewards = [];
    let remaining = pool;
    let remainingWeight = total;
    for (let index = 0; index < activity.rows.length; index += 1) {
      const row = activity.rows[index];
      const weight = scaledDecimal(row.activity_dzp);
      const rewardScaled = index === activity.rows.length - 1 ? remaining : multiplyRatioScaled(remaining, weight, remainingWeight);
      remaining -= rewardScaled;
      remainingWeight -= weight;
      if (rewardScaled <= 0n) continue;
      const rewardDzx = decimalFromScaled(rewardScaled);
      const transaction = await postEconomyTransactionOnClient(client, {
        idempotencyKey: `reward-pool:${run.id}:${row.user_id}`,
        userId: row.user_id,
        type: 'REWARD',
        metadata: { source: 'reward_pool', distribution_run_id: String(run.id), period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), activity_dzp: row.activity_dzp },
        movements: [{ currency: 'DZX', amount: rewardDzx, source: 'reward_pool' }],
      });
      await client.query(
        `INSERT INTO reward_pool_distribution_entries(run_id,user_id,activity_dzp,effective_weight,share_ratio,reward_dzx,reward_transaction_id)
         VALUES($1,$2,$3::numeric,$3::numeric,($3::numeric/$4::numeric),$5::numeric,$6)`,
        [run.id, row.user_id, row.activity_dzp, decimalFromScaled(total), rewardDzx, transaction.transaction.id]
      );
      rewards.push({ userId: row.user_id, activityDzp: row.activity_dzp, rewardDzx });
    }
    return { duplicate: false, run, totalActivityDzp: decimalFromScaled(total), rewards };
  });
}

module.exports = { getRewardPoolStatus, settleRewardPool, previousUtcPlusOneDay };
