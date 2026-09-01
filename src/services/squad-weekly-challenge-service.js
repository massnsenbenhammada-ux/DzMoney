const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient } = require('./economy-service');

const VALID_SCOPES = ['ALL TASKS', 'Type Tasks', 'Verified Ad', 'Verified Task', 'Verified Squad AdView', 'All Activity Verified'];
const TASK_TYPES = ['daily', 'game', 'social', 'web', 'special'];
const CURRENCIES = ['COIN', 'DZX', 'DZP'];
const SCALE = 1000000000n;
const UTC_PLUS_ONE = 'Etc/GMT-1';

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

function roundRatio(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function nextChallengeStart(now = new Date()) {
  const local = new Date(now.getTime() + 3600000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
  return new Date(start.getTime() - 3600000);
}

function challengeWindow(startAt) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid challenge start');
  return { startsAt: start, endsAt: new Date(start.getTime() + 7 * 86400000) };
}

function matchesChallengeScope(activity, scope, scopeValue) {
  if (!VALID_SCOPES.includes(scope)) return false;
  if (scope === 'ALL TASKS' || scope === 'Verified Task') return activity.source === 'task';
  if (scope === 'Type Tasks') return activity.source === 'task' && activity.activityType === scopeValue;
  if (scope === 'Verified Ad') return activity.source === 'advertisement';
  if (scope === 'Verified Squad AdView') return activity.source === 'advertisement' && activity.activityContext === 'squad';
  return activity.source === 'task' || activity.source === 'advertisement';
}

function distributeReward(totalReward, contributors) {
  const total = scaledDecimal(totalReward);
  if (!contributors.length || total === 0n) return [];
  const normalized = contributors
    .map(item => ({ userId: String(item.userId), contribution: scaledDecimal(item.contribution) }))
    .filter(item => item.contribution > 0n)
    .sort((a, b) => a.contribution === b.contribution ? a.userId.localeCompare(b.userId) : a.contribution > b.contribution ? -1 : 1);
  const totalContribution = normalized.reduce((sum, item) => sum + item.contribution, 0n);
  if (totalContribution === 0n) return [];
  let allocated = 0n;
  return normalized.map((item, index) => {
    const rewardScaled = index === normalized.length - 1 ? total - allocated : roundRatio(total * item.contribution, totalContribution);
    allocated += rewardScaled;
    return { userId: item.userId, contribution: decimalFromScaled(item.contribution), rewardScaled: String(rewardScaled), rewardAmount: decimalFromScaled(rewardScaled) };
  });
}

function validateScope(scope, scopeValue) {
  if (!VALID_SCOPES.includes(scope)) throw new Error('Unsupported challenge scope');
  if (scope === 'Type Tasks' && !TASK_TYPES.includes(scopeValue)) throw new Error('Unsupported task challenge type');
  if (scope !== 'Type Tasks' && scopeValue !== null && scopeValue !== undefined && scopeValue !== '') throw new Error('scopeValue is only valid for Type Tasks');
}

function validateReward(currency, amount) {
  if (!CURRENCIES.includes(currency)) throw new Error('Unsupported challenge reward currency');
  if (scaledDecimal(amount) <= 0n) throw new Error('Challenge reward amount must be positive');
}

async function createWeeklyChallenge({ squadId, name, scope, scopeValue = null, rewardCurrency, rewardAmount, adminTelegramUserId }) {
  if (!squadId) throw new Error('squadId is required');
  if (!name || String(name).trim().length > 120) throw new Error('Challenge name is required');
  validateScope(scope, scopeValue);
  validateReward(rewardCurrency, rewardAmount);
  return withTransaction(async client => {
    const squad = await client.query('SELECT id FROM squads WHERE id=$1', [squadId]);
    if (!squad.rowCount) throw new Error('Squad not found');
    const result = await client.query(
      `WITH challenge_start AS (
         SELECT (((CURRENT_TIMESTAMP AT TIME ZONE '${UTC_PLUS_ONE}')::date + INTERVAL '1 day') AT TIME ZONE '${UTC_PLUS_ONE}') AS starts_at
       )
       INSERT INTO squad_weekly_challenges
         (squad_id,name,scope_type,scope_value,reward_currency,reward_amount,starts_at,ends_at,status,config_snapshot,created_by_admin_telegram_id)
       SELECT $1,$2,$3,$4,$5,$6::numeric,starts_at,starts_at + INTERVAL '7 days','scheduled',$7::jsonb,$8
       FROM challenge_start
       RETURNING *`,
      [squadId, String(name).trim(), scope, scopeValue || null, rewardCurrency, String(rewardAmount), JSON.stringify({ scope, scopeValue: scopeValue || null, rewardCurrency, rewardAmount: String(rewardAmount) }), String(adminTelegramUserId || '')]
    );
    return result.rows[0];
  });
}

function scopeSql(challengeAlias = 'c', transactionAlias = 'lt') {
  return `(
    (${challengeAlias}.scope_type IN ('ALL TASKS','Verified Task') AND ${transactionAlias}.metadata->>'source'='task') OR
    (${challengeAlias}.scope_type='Type Tasks' AND ${transactionAlias}.metadata->>'source'='task' AND ${transactionAlias}.metadata->>'activity_type'=${challengeAlias}.scope_value) OR
    (${challengeAlias}.scope_type='Verified Ad' AND ${transactionAlias}.metadata->>'source'='advertisement') OR
    (${challengeAlias}.scope_type='Verified Squad AdView' AND ${transactionAlias}.metadata->>'source'='advertisement' AND ${transactionAlias}.metadata->>'activity_context'='squad') OR
    (${challengeAlias}.scope_type='All Activity Verified' AND ${transactionAlias}.metadata->>'source' IN ('task','advertisement'))
  )`;
}

async function recordContributions(client, challenge) {
  await client.query(
    `INSERT INTO squad_weekly_challenge_contributions(challenge_id,user_id,dzp_contribution)
     SELECT c.id,lt.user_id,SUM(le.amount)
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le.transaction_id=lt.id
     JOIN squad_weekly_challenges c ON c.id=$1
     WHERE lt.transaction_type='REWARD' AND le.currency='DZP' AND le.amount > 0
       AND lt.created_at >= c.starts_at AND lt.created_at < c.ends_at
       AND ${scopeSql('c','lt')}
     GROUP BY c.id,lt.user_id
     ON CONFLICT (challenge_id,user_id) DO UPDATE SET dzp_contribution=EXCLUDED.dzp_contribution,updated_at=NOW()`,
    [challenge.id]
  );
}

async function settleWeeklyChallenge({ challengeId, now = new Date() }) {
  return withTransaction(async client => {
    const result = await client.query('SELECT * FROM squad_weekly_challenges WHERE id=$1 FOR UPDATE', [challengeId]);
    if (!result.rowCount) throw new Error('Challenge not found');
    const challenge = result.rows[0];
    if (challenge.status === 'settled') return { duplicate: true, challenge, rewards: await existingRewards(client, challenge.id) };
    if (new Date(now) < new Date(challenge.ends_at)) throw new Error('Challenge has not ended');
    await recordContributions(client, challenge);
    const eligible = await client.query(
      `SELECT c.user_id,c.dzp_contribution
       FROM squad_weekly_challenge_contributions c
       JOIN squad_memberships sm ON sm.user_id=c.user_id AND sm.squad_id=$2 AND sm.status IN ('active','inactive')
       WHERE c.challenge_id=$1 AND c.dzp_contribution > 0
       ORDER BY c.dzp_contribution DESC,c.user_id ASC`,
      [challenge.id, challenge.squad_id]
    );
    const rewards = distributeReward(challenge.reward_amount, eligible.rows.map(row => ({ userId: row.user_id, contribution: row.dzp_contribution })));
    for (const reward of rewards) {
      const transaction = await postEconomyTransactionOnClient(client, {
        idempotencyKey: `squad-challenge:${challenge.id}:${reward.userId}`,
        userId: reward.userId,
        type: 'REWARD',
        metadata: { source: 'squad_challenge', challenge_id: String(challenge.id), challenge_scope: challenge.scope_type },
        movements: [{ currency: challenge.reward_currency, amount: reward.rewardAmount, source: 'squad_challenge' }]
      });
      await client.query(
        `UPDATE squad_weekly_challenge_contributions SET reward_amount=$1,reward_transaction_id=$2,updated_at=NOW() WHERE challenge_id=$3 AND user_id=$4`,
        [reward.rewardAmount, transaction.transaction.id, challenge.id, reward.userId]
      );
    }
    await client.query("UPDATE squad_weekly_challenges SET status='settled',settled_at=NOW() WHERE id=$1", [challenge.id]);
    return { duplicate: false, challenge, rewards };
  });
}

async function existingRewards(client, challengeId) {
  const result = await client.query('SELECT user_id,dzp_contribution,reward_amount,reward_transaction_id FROM squad_weekly_challenge_contributions WHERE challenge_id=$1 AND reward_amount IS NOT NULL ORDER BY user_id', [challengeId]);
  return result.rows;
}

async function listWeeklyChallenges({ squadId }) {
  if (!squadId) throw new Error('squadId is required');
  const result = await query(`SELECT id,squad_id,name,scope_type,scope_value,reward_currency,reward_amount,starts_at,ends_at,status,config_snapshot,settled_at FROM squad_weekly_challenges WHERE squad_id=$1 ORDER BY starts_at DESC,id DESC`, [squadId]);
  return result.rows;
}

module.exports = { VALID_SCOPES, nextChallengeStart, challengeWindow, matchesChallengeScope, distributeReward, createWeeklyChallenge, settleWeeklyChallenge, listWeeklyChallenges };
