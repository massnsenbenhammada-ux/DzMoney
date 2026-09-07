const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const { startRotatedAdvertisementEventOnClient } = require('./ad-event-service');

const CODE_PATTERN = /^[A-Z0-9_-]{3,64}$/;
const REWARD_CURRENCIES = new Set(['COIN', 'DZX']);

function normalizePromoCode(value) {
  if (typeof value !== 'string') throw new Error('Invalid promo code');
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error('Invalid promo code');
  return code;
}

function normalizeReward({ rewardCurrency, rewardAmount }) {
  const currency = String(rewardCurrency || '').trim().toUpperCase();
  if (!REWARD_CURRENCIES.has(currency)) throw new Error('Invalid reward currency');
  const amount = String(rewardAmount ?? '').trim();
  if (!/^\d+(?:\.\d{1,9})?$/.test(amount) || Number(amount) <= 0) throw new Error('Reward amount must be positive');
  return { currency, amount };
}

function normalizeEligibility(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Eligibility must be an object');
  const ids = Array.isArray(value.telegramUserIds) ? value.telegramUserIds.map(String).filter(id => /^\d{1,20}$/.test(id)) : [];
  if (ids.length !== (Array.isArray(value.telegramUserIds) ? value.telegramUserIds.length : 0)) throw new Error('Eligibility telegramUserIds are invalid');
  return { telegramUserIds: [...new Set(ids)] };
}

function normalizeLimit(value, name) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer or null`);
  return number;
}

function normalizeDate(value, name) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is invalid`);
  return date.toISOString();
}

function campaignResponse(row) {
  return { id: row.id, code: row.code, rewardCurrency: row.reward_currency, rewardAmount: row.reward_amount, maxRedemptions: row.max_redemptions, perUserLimit: row.per_user_limit, startsAt: row.starts_at, expiresAt: row.expires_at, eligibility: row.eligibility, adGated: row.ad_gated, enabled: row.enabled };
}

function redemptionResponse(row) {
  return { id: row.id, code: row.code, status: row.status, rewardCurrency: row.reward_currency, rewardAmount: row.reward_amount, adEventId: row.ad_event_id, externalAdId: row.external_ad_id || null, providerId: row.provider_id || null };
}

async function assertEligible(client, campaign, userId) {
  const ids = campaign.eligibility?.telegramUserIds || [];
  if (!ids.length) return;
  const user = await client.query('SELECT telegram_user_id FROM users WHERE id=$1', [userId]);
  if (!user.rowCount || !ids.includes(String(user.rows[0].telegram_user_id))) throw new Error('You are not eligible for this promo code');
}

async function loadCampaignForUpdate(client, code) {
  const result = await client.query('SELECT * FROM promo_campaigns WHERE code=$1 FOR UPDATE', [code]);
  if (!result.rowCount) throw new Error('Promo code is invalid');
  const campaign = result.rows[0];
  const now = Date.now();
  if (!campaign.enabled) throw new Error('Promo code is disabled');
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) throw new Error('Promo code is not active yet');
  if (campaign.expires_at && new Date(campaign.expires_at).getTime() <= now) throw new Error('Promo code has expired');
  return campaign;
}

async function redeemPromoCode({ userId, code: rawCode, idempotencyKey, providerRegistry }) {
  if (!userId) throw new Error('userId is required');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  const code = normalizePromoCode(rawCode);
  return withTransaction(async client => {
    const existing = await client.query(`SELECT r.*,c.code,e.external_ad_id,e.metadata->>'provider_id' AS provider_id FROM promo_redemptions r JOIN promo_campaigns c ON c.id=r.campaign_id LEFT JOIN activity_ad_events e ON e.id=r.ad_event_id WHERE r.idempotency_key=$1 FOR SHARE`, [idempotencyKey]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.user_id) !== String(userId) || row.code !== code) throw new Error('Idempotency key operation mismatch');
      return { ...redemptionResponse(row), duplicate: true };
    }
    const campaign = await loadCampaignForUpdate(client, code);
    await assertEligible(client, campaign, userId);
    const total = await client.query(`SELECT COUNT(*)::int AS count FROM promo_redemptions WHERE campaign_id=$1 AND status IN ('pending','verified') AND expires_at>NOW()`, [campaign.id]);
    if (campaign.max_redemptions !== null && Number(total.rows[0].count) >= campaign.max_redemptions) throw new Error('Promo code usage limit reached');
    const userCount = await client.query(`SELECT COUNT(*)::int AS count FROM promo_redemptions WHERE campaign_id=$1 AND user_id=$2 AND status IN ('pending','verified') AND expires_at>NOW()`, [campaign.id, userId]);
    if (Number(userCount.rows[0].count) >= campaign.per_user_limit) throw new Error('Promo code already used');
    const inserted = await client.query(`INSERT INTO promo_redemptions(campaign_id,user_id,idempotency_key,status,reward_currency,reward_amount) VALUES($1,$2,$3,'pending',$4,$5) RETURNING *`, [campaign.id, userId, idempotencyKey, campaign.reward_currency, campaign.reward_amount]);
    const redemption = inserted.rows[0];
    if (!campaign.ad_gated) {
      const reward = await creditActivityRewardOnClient(client, { idempotencyKey: `promo:reward:${redemption.id}`, userId, source: 'promo', coin: campaign.reward_currency === 'COIN' ? campaign.reward_amount : 0, dzx: campaign.reward_currency === 'DZX' ? campaign.reward_amount : 0, dzp: 0, modifiers: [] });
      await client.query(`UPDATE promo_redemptions SET status='verified',verified_at=NOW() WHERE id=$1`, [redemption.id]);
      return { ...redemptionResponse({ ...redemption, status: 'verified' }), duplicate: false, rewarded: !reward.duplicate, transaction: reward.transaction };
    }
    if (!providerRegistry) throw new Error('Advertisement provider registry is required');
    const ad = await startRotatedAdvertisementEventOnClient(client, { userId, context: 'promo', idempotencyKey: `promo:ad:${redemption.id}`, providerRegistry, metadata: { promo_redemption_id: redemption.id, promo_campaign_id: campaign.id } });
    await client.query('UPDATE promo_redemptions SET ad_event_id=$1 WHERE id=$2', [ad.adEvent.id, redemption.id]);
    return { id: redemption.id, code, status: 'pending', rewardCurrency: campaign.reward_currency, rewardAmount: campaign.reward_amount, adEventId: ad.adEvent.id, externalAdId: ad.adEvent.external_ad_id, providerId: ad.providerId, adGated: true, duplicate: false };
  });
}

async function finalizePromoRedemption({ userId, adEventId, providerRegistry, providerId, providerPayload }) {
  if (!userId || !adEventId) throw new Error('userId and adEventId are required');
  if (!providerRegistry) throw new Error('Advertisement provider registry is required');
  const { verifyWithProvider } = require('./ad-provider-service');
  const verification = await verifyWithProvider(providerRegistry, { context: 'promo', providerId, payload: providerPayload });
  if (!verification.verification.verified) return { rewarded: false, duplicate: false, status: 'pending' };
  return withTransaction(async client => {
    const result = await client.query(`SELECT r.*,c.code,e.context,e.user_id AS ad_user_id,e.verified,e.metadata->>'provider_id' AS event_provider FROM promo_redemptions r JOIN promo_campaigns c ON c.id=r.campaign_id JOIN activity_ad_events e ON e.id=r.ad_event_id WHERE r.ad_event_id=$1 FOR UPDATE`, [adEventId]);
    if (!result.rowCount) throw new Error('Promo redemption not found');
    const row = result.rows[0];
    if (String(row.user_id) !== String(userId) || String(row.ad_user_id) !== String(userId)) throw new Error('Promo advertisement user does not match');
    if (row.context !== 'promo') throw new Error('Advertisement context mismatch');
    if (row.event_provider !== verification.providerId) throw new Error('Advertisement provider does not match');
    if (row.status === 'verified') return { ...redemptionResponse(row), rewarded: true, duplicate: true };
    if (row.status !== 'pending') throw new Error('Promo redemption is not pending');
    if (new Date(row.expires_at).getTime() <= Date.now()) { await client.query(`UPDATE promo_redemptions SET status='expired' WHERE id=$1`, [row.id]); throw new Error('Promo redemption has expired'); }
    if (row.verified) return { ...redemptionResponse(row), rewarded: false, duplicate: true, status: 'pending' };
    await client.query(`UPDATE activity_ad_events SET completed_at=COALESCE(completed_at,NOW()),verified=TRUE,metadata=metadata||$2::jsonb WHERE id=$1`, [adEventId, JSON.stringify({ provider_reference: verification.verification.reference, provider_verification: verification.verification.metadata || {}, provider_id: verification.providerId, context: 'promo' })]);
    const reward = await creditActivityRewardOnClient(client, { idempotencyKey: `promo:reward:${row.id}`, userId, source: 'promo', coin: row.reward_currency === 'COIN' ? row.reward_amount : 0, dzx: row.reward_currency === 'DZX' ? row.reward_amount : 0, dzp: 0, modifiers: [] });
    await client.query(`UPDATE promo_redemptions SET status='verified',verified_at=NOW() WHERE id=$1`, [row.id]);
    return { ...redemptionResponse({ ...row, status: 'verified' }), rewarded: !reward.duplicate, duplicate: reward.duplicate, transaction: reward.transaction };
  });
}

async function getPromoRedemption({ userId, redemptionId }) {
  const result = await query(`SELECT r.*,c.code,e.external_ad_id,e.metadata->>'provider_id' AS provider_id FROM promo_redemptions r JOIN promo_campaigns c ON c.id=r.campaign_id LEFT JOIN activity_ad_events e ON e.id=r.ad_event_id WHERE r.id=$1 AND r.user_id=$2`, [redemptionId, userId]);
  if (!result.rowCount) throw new Error('Promo redemption not found');
  return redemptionResponse(result.rows[0]);
}

async function listPromoCampaigns() {
  const result = await query('SELECT * FROM promo_campaigns ORDER BY id DESC');
  return result.rows.map(campaignResponse);
}

function normalizeCampaignInput(input, partial = false) {
  const reward = partial && input.rewardCurrency === undefined && input.rewardAmount === undefined ? null : normalizeReward(input);
  const code = input.code === undefined && partial ? undefined : normalizePromoCode(input.code);
  const maxRedemptions = input.maxRedemptions === undefined && partial ? undefined : normalizeLimit(input.maxRedemptions, 'maxRedemptions');
  const perUserLimit = input.perUserLimit === undefined && partial ? undefined : normalizeLimit(input.perUserLimit, 'perUserLimit') || 1;
  const startsAt = input.startsAt === undefined && partial ? undefined : normalizeDate(input.startsAt, 'startsAt');
  const expiresAt = input.expiresAt === undefined && partial ? undefined : normalizeDate(input.expiresAt, 'expiresAt');
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) throw new Error('expiresAt must be after startsAt');
  return { code, reward, maxRedemptions, perUserLimit, startsAt, expiresAt, eligibility: input.eligibility === undefined && partial ? undefined : normalizeEligibility(input.eligibility), adGated: input.adGated === undefined && partial ? undefined : Boolean(input.adGated), enabled: input.enabled === undefined && partial ? undefined : Boolean(input.enabled) };
}

async function createPromoCampaign(input) {
  const data = normalizeCampaignInput(input);
  return withTransaction(async client => {
    const result = await client.query(`INSERT INTO promo_campaigns(code,reward_currency,reward_amount,max_redemptions,per_user_limit,starts_at,expires_at,eligibility,ad_gated,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`, [data.code, data.reward.currency, data.reward.amount, data.maxRedemptions, data.perUserLimit, data.startsAt, data.expiresAt, JSON.stringify(data.eligibility), data.adGated, data.enabled]);
    return campaignResponse(result.rows[0]);
  });
}

async function updatePromoCampaign(id, input, actorTelegramUserId) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid promo campaign id');
  const data = normalizeCampaignInput(input, true);
  return withTransaction(async client => {
    const current = await client.query('SELECT * FROM promo_campaigns WHERE id=$1 FOR UPDATE', [id]);
    if (!current.rowCount) throw new Error('Promo campaign not found');
    const old = campaignResponse(current.rows[0]);
    const next = { code: data.code ?? old.code, reward: data.reward || { currency: old.rewardCurrency, amount: old.rewardAmount }, maxRedemptions: data.maxRedemptions === undefined ? old.maxRedemptions : data.maxRedemptions, perUserLimit: data.perUserLimit === undefined ? old.perUserLimit : data.perUserLimit, startsAt: data.startsAt === undefined ? old.startsAt : data.startsAt, expiresAt: data.expiresAt === undefined ? old.expiresAt : data.expiresAt, eligibility: data.eligibility === undefined ? old.eligibility : data.eligibility, adGated: data.adGated === undefined ? old.adGated : data.adGated, enabled: data.enabled === undefined ? old.enabled : data.enabled };
    if (next.startsAt && next.expiresAt && new Date(next.expiresAt) <= new Date(next.startsAt)) throw new Error('expiresAt must be after startsAt');
    const result = await client.query(`UPDATE promo_campaigns SET code=$1,reward_currency=$2,reward_amount=$3,max_redemptions=$4,per_user_limit=$5,starts_at=$6,expires_at=$7,eligibility=$8::jsonb,ad_gated=$9,enabled=$10,updated_at=NOW() WHERE id=$11 RETURNING *`, [next.code, next.reward.currency, next.reward.amount, next.maxRedemptions, next.perUserLimit, next.startsAt, next.expiresAt, JSON.stringify(next.eligibility), next.adGated, next.enabled, id]);
    await client.query(`INSERT INTO admin_audit_log(setting_key,old_value,new_value,actor_telegram_user_id) VALUES($1,$2::jsonb,$3::jsonb,$4)`, [`promo_campaign:${id}`, JSON.stringify(old), JSON.stringify(campaignResponse(result.rows[0])), actorTelegramUserId || null]);
    return campaignResponse(result.rows[0]);
  });
}

module.exports = { normalizePromoCode, normalizeReward, redeemPromoCode, finalizePromoRedemption, getPromoRedemption, listPromoCampaigns, createPromoCampaign, updatePromoCampaign };
