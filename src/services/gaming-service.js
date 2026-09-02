const { randomInt } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient } = require('./economy-service');
const { startAdvertisementEvent } = require('./ad-event-service');
const { selectProvider } = require('./ad-provider-service');

const RESET_OFFSET = "'1 hour'";
const GAME_KEYS = new Set(['spin', 'digging']);

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function currentGamingDay() {
  return `(NOW() AT TIME ZONE 'UTC' + INTERVAL ${RESET_OFFSET})::date`;
}

async function getConfig(client = null) {
  const runner = client || { query };
  const result = await runner.query('SELECT version, config FROM gaming_config_versions ORDER BY version DESC LIMIT 1');
  if (!result.rowCount) throw new Error('Gaming configuration is not initialized');
  return result.rows[0];
}

async function ensureAccount(client, userId, config) {
  await client.query(`INSERT INTO gaming_accounts(user_id,energy_remaining) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING`, [userId, config.digging.energy]);
  const day = await client.query(`SELECT activity_day, energy_day FROM gaming_accounts WHERE user_id=$1 FOR UPDATE`, [userId]);
  const account = day.rows[0];
  if (String(account.activity_day) !== String(await currentDay(client))) await client.query(`UPDATE gaming_accounts SET activity_claimed=0,activity_day=${currentGamingDay()} WHERE user_id=$1`, [userId]);
  if (String(account.energy_day) !== String(await currentDay(client))) await client.query(`UPDATE gaming_accounts SET energy_remaining=$2,energy_day=${currentGamingDay()} WHERE user_id=$1`, [userId, config.digging.energy]);
  const refreshed = await client.query('SELECT * FROM gaming_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
  return refreshed.rows[0];
}

async function currentDay(client) {
  const result = await client.query(`SELECT ${currentGamingDay()} AS day`);
  return result.rows[0].day;
}

function weightedChoice(weights) {
  const entries = Object.entries(weights || {}).filter(([, weight]) => Number(weight) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (!Number.isInteger(total) || total <= 0) throw new Error('Gaming reward weights are invalid');
  let pick = randomInt(total);
  for (const [key, weight] of entries) {
    pick -= Number(weight);
    if (pick < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function spinReward(config) {
  const weights = { ...config.spin.weights };
  if (!config.spin.jackpotEnabled) delete weights.jackpot;
  const result = weightedChoice(weights);
  const reward = {};
  if (result === 'coin_100') reward.coin = 100;
  if (result === 'coin_1000') reward.coin = 1000;
  if (result === 'dzx_1') reward.dzx = 1;
  if (result === 'dzx_10') reward.dzx = 10;
  if (result === 'dzp_1') reward.dzp = 1;
  if (result === 'dzp_10') reward.dzp = 10;
  if (result === 'jackpot') reward.dzx = Number(config.spin.jackpotRewardDzx);
  return { result, reward };
}

function diggingReward(config) {
  const weights = { ...config.digging.weights };
  if (!config.digging.jackpotEnabled) delete weights.jackpot;
  const result = weightedChoice(weights);
  const reward = {};
  if (result === 'coin_100') reward.coin = 100;
  if (result === 'dzx_1') reward.dzx = 1;
  if (result === 'dzp_1') reward.dzp = 1;
  return { result, reward };
}

async function creditGamingReward(client, userId, idempotencyKey, reward, metadata) {
  const movements = [];
  if (reward.coin) movements.push({ currency: 'COIN', amount: reward.coin, source: 'gaming' });
  if (reward.dzx) movements.push({ currency: 'DZX', amount: reward.dzx, source: 'gaming' });
  if (reward.dzp) movements.push({ currency: 'DZP', amount: reward.dzp, source: 'gaming', dzpBucket: 'earned_dzp' });
  if (!movements.length) return { transaction: null, duplicate: false };
  return postEconomyTransactionOnClient(client, { idempotencyKey, userId, type: 'GAMING_REWARD', metadata, movements });
}

async function grantGamingResourceOnClient(client, { userId, resource, sourceReference }) {
  requiredId(userId, 'userId');
  if (!['spin', 'axe'].includes(resource)) throw new Error('Invalid Gaming resource');
  const configRow = await getConfig(client);
  const config = configRow.config;
  const account = await ensureAccount(client, userId, config);
  const limit = Number(config.dailyActivityLimit);
  if (account.activity_claimed >= limit) return { granted: false, reason: 'daily_limit', balance: resource === 'spin' ? account.spins : account.axes };
  const column = resource === 'spin' ? 'spins' : 'axes';
  const updated = await client.query(`UPDATE gaming_accounts SET ${column}=${column}+1,activity_claimed=activity_claimed+1,updated_at=NOW() WHERE user_id=$1 RETURNING *`, [userId]);
  return { granted: true, resource, sourceReference, account: updated.rows[0] };
}

async function claimGamingResource({ userId, resource, sourceReference }) {
  return withTransaction(client => grantGamingResourceOnClient(client, { userId, resource, sourceReference }));
}

async function spin({ userId, idempotencyKey }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const existing = await client.query('SELECT * FROM gaming_spin_results WHERE user_id=$1 AND idempotency_key=$2', [userId, idempotencyKey]);
    if (existing.rowCount) return { duplicate: true, result: existing.rows[0] };
    const configRow = await getConfig(client);
    const config = configRow.config;
    if (!config.enabled) throw new Error('Gaming is disabled');
    const account = await ensureAccount(client, userId, config);
    if (account.spins < 1) throw new Error('No Spins available');
    const rolled = spinReward(config);
    await client.query('UPDATE gaming_accounts SET spins=spins-1,updated_at=NOW() WHERE user_id=$1', [userId]);
    const economy = await creditGamingReward(client, userId, `gaming:spin:${idempotencyKey}`, rolled.reward, { source: 'gaming', game: 'spin', result: rolled.result, config_version: configRow.version });
    if (rolled.result === 'extra_spin') await client.query('UPDATE gaming_accounts SET spins=spins+1 WHERE user_id=$1', [userId]);
    const saved = await client.query(`INSERT INTO gaming_spin_results(user_id,config_version,result,reward,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING *`, [userId, configRow.version, rolled.result, rolled.reward, idempotencyKey]);
    return { duplicate: false, result: saved.rows[0], transaction: economy.transaction };
  });
}

function buildBoard(config) {
  const board = [];
  for (let i = 0; i < Number(config.digging.boardSize); i += 1) board.push({ id: i + 1, revealed: false, result: diggingReward(config).result, reward: {} });
  return board;
}

async function startDigging({ userId }) {
  requiredId(userId, 'userId');
  return withTransaction(async client => {
    const configRow = await getConfig(client);
    const config = configRow.config;
    if (!config.enabled) throw new Error('Gaming is disabled');
    const account = await ensureAccount(client, userId, config);
    const existing = await client.query("SELECT * FROM gaming_sessions WHERE user_id=$1 AND status='active'", [userId]);
    if (existing.rowCount) return { duplicate: true, session: existing.rows[0], account };
    if (account.axes < 1) throw new Error('No Axes available');
    await client.query('UPDATE gaming_accounts SET axes=axes-1,updated_at=NOW() WHERE user_id=$1', [userId]);
    const board = buildBoard(config);
    const result = await client.query('INSERT INTO gaming_sessions(user_id,config_version,board) VALUES($1,$2,$3) RETURNING *', [userId, configRow.version, JSON.stringify(board)]);
    return { duplicate: false, session: result.rows[0] };
  });
}

async function revealDiggingTile({ userId, sessionId, tileId }) {
  requiredId(userId, 'userId');
  requiredId(sessionId, 'sessionId');
  const tile = Number(tileId);
  if (!Number.isInteger(tile) || tile <= 0) throw new Error('Invalid tile');
  return withTransaction(async client => {
    const sessionResult = await client.query("SELECT * FROM gaming_sessions WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE", [sessionId, userId]);
    if (!sessionResult.rowCount) throw new Error('Active digging session not found');
    const session = sessionResult.rows[0];
    const board = Array.isArray(session.board) ? session.board : [];
    const selected = board.find(item => item.id === tile);
    if (!selected) throw new Error('Tile not found');
    if (selected.revealed) return { duplicate: true, tile: selected, session };
    const configResult = await client.query('SELECT config FROM gaming_config_versions WHERE version=$1', [session.config_version]);
    if (!configResult.rowCount) throw new Error('Digging configuration version not found');
    const account = await ensureAccount(client, userId, configResult.rows[0].config);
    if (account.energy_remaining < 1) throw new Error('No more digs today');
    const reward = selected.result === 'jackpot' ? { dzx: Number(configResult.rows[0].config.digging.jackpotRewardDzx) } : selected.result === 'extra_axe' ? {} : diggingRewardFromResult(selected.result);
    selected.revealed = true;
    selected.reward = reward;
    await client.query('UPDATE gaming_accounts SET energy_remaining=energy_remaining-1,updated_at=NOW() WHERE user_id=$1', [userId]);
    if (selected.result === 'extra_axe') await client.query('UPDATE gaming_accounts SET axes=axes+1 WHERE user_id=$1', [userId]);
    const economy = await creditGamingReward(client, userId, `gaming:digging:${session.id}:${tile}`, reward, { source: 'gaming', game: 'digging', session_id: session.id, tile_id: tile, config_version: session.config_version, result: selected.result });
    const remaining = board.filter(item => !item.revealed).length;
    const status = remaining ? 'active' : 'completed';
    const updated = await client.query('UPDATE gaming_sessions SET board=$2,status=$3,completed_at=CASE WHEN $3=\'completed\' THEN NOW() ELSE completed_at END WHERE id=$1 RETURNING *', [session.id, JSON.stringify(board), status]);
    return { duplicate: false, tile: selected, session: updated.rows[0], transaction: economy.transaction };
  });
}

function diggingRewardFromResult(result) {
  if (result === 'coin_100') return { coin: 100 };
  if (result === 'dzx_1') return { dzx: 1 };
  if (result === 'dzp_1') return { dzp: 1 };
  return {};
}

async function startGamingAdvertisement({ userId, game, idempotencyKey, providerRegistry }) {
  requiredId(userId, 'userId');
  if (!GAME_KEYS.has(game)) throw new Error('Invalid Gaming game');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!providerRegistry) throw new Error('Advertisement provider registry is required');
  return withTransaction(async client => {
    const configRow = await getConfig(client);
    const account = await ensureAccount(client, userId, configRow.config);
    const existing = await client.query('SELECT * FROM activity_ad_events WHERE user_id=$1 AND context=\'gaming\' AND idempotency_key=$2', [userId, idempotencyKey]);
    if (existing.rowCount) return { adEvent: existing.rows[0], providerId: existing.rows[0].metadata?.provider_id, duplicate: true };
    const limit = Number(configRow.config.dailyAdLimit);
    const count = await client.query(`SELECT COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context='gaming' AND metadata->>'game'=$2 AND verified=TRUE AND (completed_at + INTERVAL '1 hour')::date=${currentGamingDay()}`, [userId, game]);
    if (Number(count.rows[0].count) >= limit) throw new Error('Gaming daily ad limit reached');
    const provider = selectProvider(providerRegistry, { context: 'gaming' });
    const event = await client.query(`INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,metadata) VALUES($1,'gaming',gen_random_uuid()::text,$2,NOW(),$3) RETURNING *`, [userId, idempotencyKey, { game, provider_id: provider.id, config_version: configRow.version }]);
    return { adEvent: event.rows[0], providerId: provider.id, duplicate: false, account };
  });
}

async function finalizeGamingAdvertisement({ userId, adEventId, providerReference, verificationMetadata = {} }) {
  requiredId(userId, 'userId');
  requiredId(adEventId, 'adEventId');
  requiredId(providerReference, 'providerReference');
  return withTransaction(async client => {
    const eventResult = await client.query("SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context='gaming' FOR UPDATE", [adEventId, userId]);
    if (!eventResult.rowCount) throw new Error('Gaming advertisement event not found');
    const event = eventResult.rows[0];
    if (event.verified && event.metadata?.gaming_reward_transaction_id) return { duplicate: true, rewarded: true, event };
    const verified = await client.query(`UPDATE activity_ad_events SET completed_at=COALESCE(completed_at,NOW()),verified=TRUE,metadata=metadata||$2::jsonb WHERE id=$1 AND verified=FALSE RETURNING *`, [adEventId, JSON.stringify({ provider_reference: providerReference, provider_verification: verificationMetadata })]);
    const current = verified.rows[0] || event;
    if (event.verified) return { duplicate: true, rewarded: false, event: current };
    const configResult = await client.query('SELECT config FROM gaming_config_versions WHERE version=$1', [current.metadata.config_version]);
    if (!configResult.rowCount) throw new Error('Gaming configuration version not found');
    const config = configResult.rows[0].config;
    const account = await ensureAccount(client, userId, config);
    const game = current.metadata.game;
    const bonus = weightedChoice(config.adBonus);
    const reward = bonus === 'coin_100' ? { coin: 100 } : { dzx: 1 };
    const resourceColumn = game === 'spin' ? 'spins' : null;
    const every = Number(config.diggingAxeEveryAds);
    let progress = game === 'spin' ? account.spin_ad_progress + 1 : account.digging_ad_progress + 1;
    let resourceGranted = null;
    if (game === 'spin') {
      await client.query('UPDATE gaming_accounts SET spins=spins+1,spin_ad_progress=$2,updated_at=NOW() WHERE user_id=$1', [userId, progress]);
      resourceGranted = 'spin';
    } else {
      const extraAxe = progress % every === 0;
      await client.query(`UPDATE gaming_accounts SET digging_ad_progress=$2,axes=axes+$3,updated_at=NOW() WHERE user_id=$1`, [userId, progress, extraAxe ? 1 : 0]);
      resourceGranted = extraAxe ? 'axe' : null;
    }
    const economy = await creditGamingReward(client, userId, `gaming:ad:${event.id}`, reward, { source: 'gaming_ad_bonus', game, ad_event_id: event.id, provider_reference: providerReference, bonus });
    await client.query('UPDATE activity_ad_events SET metadata=metadata||$2::jsonb WHERE id=$1', [event.id, JSON.stringify({ gaming_reward_transaction_id: economy.transaction?.id || null, ad_bonus: reward, resource_granted: resourceGranted })]);
    return { duplicate: false, rewarded: true, event: current, reward, resourceGranted, progress, transaction: economy.transaction };
  });
}

async function getGamingState({ userId }) {
  requiredId(userId, 'userId');
  return withTransaction(async client => {
    const configRow = await getConfig(client);
    const account = await ensureAccount(client, userId, configRow.config);
    const active = await client.query("SELECT * FROM gaming_sessions WHERE user_id=$1 AND status='active'", [userId]);
    const today = currentGamingDay();
    const ads = await client.query(`SELECT metadata->>'game' AS game, COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context='gaming' AND verified=TRUE AND (completed_at + INTERVAL '1 hour')::date=${today} GROUP BY metadata->>'game'`, [userId]);
    const adCounts = Object.fromEntries(ads.rows.map(row => [row.game, row.count]));
    return { configVersion: configRow.version, account, activeSession: active.rows[0] || null, adCounts, config: configRow.config };
  });
}

async function updateGamingConfig({ config, actorTelegramUserId = null }) {
  return withTransaction(async client => {
    const latest = await getConfig(client);
    const version = Number(latest.version) + 1;
    await client.query('INSERT INTO gaming_config_versions(version,config,actor_telegram_user_id) VALUES($1,$2,$3)', [version, config, actorTelegramUserId]);
    return { version, config };
  });
}

module.exports = { getGamingState, spin, startDigging, revealDiggingTile, startGamingAdvertisement, finalizeGamingAdvertisement, grantGamingResourceOnClient, claimGamingResource, updateGamingConfig, getConfig };
