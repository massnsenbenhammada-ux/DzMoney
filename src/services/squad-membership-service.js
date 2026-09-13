const { withTransaction, query } = require('../db/pool');
const {
  DZP_DZX,
  decimalToScaled,
  multiplyRatioScaled,
  multiplyScaled,
  scaledToDecimal,
  postEconomyTransactionOnClient
} = require('./economy-service');

const DEFAULT_PAID_TIERS = [
  { minMembers: 1, maxMembers: 10, price: 100 },
  { minMembers: 11, maxMembers: 20, price: 200 },
  { minMembers: 21, maxMembers: 50, price: 500 },
  { minMembers: 51, maxMembers: 100, price: 1000 },
  { minMembers: 101, maxMembers: 200, price: 2000 },
  { minMembers: 201, maxMembers: 300, price: 3000 },
  { minMembers: 301, maxMembers: 400, price: 4000 },
  { minMembers: 401, maxMembers: 500, price: 5000 },
  { minMembers: 501, maxMembers: 1000, price: 7500 },
  { minMembers: 1001, maxMembers: null, price: 10000 }
];

function normalizeTier(tier) {
  const minMembers = Number(tier.minMembers);
  const maxMembers = tier.maxMembers === null ? null : Number(tier.maxMembers);
  const price = Number(tier.price);
  return { minMembers, maxMembers, price };
}

function validateTierConfiguration(tiers) {
  if (!Array.isArray(tiers) || !tiers.length) return false;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (!Number.isInteger(tier.minMembers) || tier.minMembers < 1 || !Number.isInteger(tier.price) || tier.price <= 0) return false;
    if (index < tiers.length - 1) {
      if (!Number.isInteger(tier.maxMembers) || tier.maxMembers < tier.minMembers) return false;
    } else if (tier.maxMembers !== null && (!Number.isInteger(tier.maxMembers) || tier.maxMembers < tier.minMembers)) {
      return false;
    }
    if (index > 0) {
      const previous = tiers[index - 1];
      if (previous.maxMembers === null || tier.minMembers !== previous.maxMembers + 1) return false;
    }
  }
  return tiers[tiers.length - 1].maxMembers === null;
}

async function getPaidMembershipTiers(client = null) {
  const execute = client ? client.query.bind(client) : query;
  const result = await execute("SELECT value FROM admin_settings WHERE key = 'squad.membership_tiers'");
  if (!result.rowCount) return DEFAULT_PAID_TIERS;
  const tiers = result.rows[0].value;
  if (!Array.isArray(tiers)) throw new Error('Invalid Squad membership tier configuration');
  const normalized = tiers.map(normalizeTier).sort((a, b) => a.minMembers - b.minMembers);
  if (!validateTierConfiguration(normalized)) throw new Error('Invalid Squad membership tier configuration');
  return normalized;
}

function getCurrentSquadTier(memberCount, tiers) {
  const count = Number(memberCount);
  if (!Number.isInteger(count) || count < 1) return null;
  const configuredTiers = Array.isArray(tiers) ? tiers : DEFAULT_PAID_TIERS;
  return configuredTiers.find(tier => count >= tier.minMembers && (tier.maxMembers === null || count <= tier.maxMembers)) || null;
}

async function createInvitation({ squadId, inviterUserId, inviteeUserId }) {
  return withTransaction(async client => {
    const owner = await client.query('SELECT 1 FROM squads WHERE id = $1 AND owner_user_id = $2 FOR UPDATE', [squadId, inviterUserId]);
    if (!owner.rows[0]) throw new Error('Only the squad owner can invite');
    const existing = await client.query(`SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status IN ('active', 'inactive', 'suspended') UNION ALL SELECT 1 FROM squad_invitations WHERE invitee_user_id = $1 AND status = 'pending' LIMIT 1`, [inviteeUserId]);
    if (existing.rows[0]) throw new Error('User is already assigned to a squad or has a pending invitation');
    const result = await client.query(`INSERT INTO squad_invitations (squad_id, inviter_user_id, invitee_user_id) VALUES ($1, $2, $3) RETURNING id, squad_id, invitee_user_id, status, created_at`, [squadId, inviterUserId, inviteeUserId]);
    return result.rows[0];
  });
}

async function acceptInvitation({ invitationId, inviteeUserId }) {
  return withTransaction(async client => {
    const invitation = await client.query(`SELECT id, squad_id FROM squad_invitations WHERE id = $1 AND invitee_user_id = $2 AND status = 'pending' FOR UPDATE`, [invitationId, inviteeUserId]);
    if (!invitation.rows[0]) throw new Error('Invitation is not pending');
    const existingMembership = await client.query(`SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status IN ('active', 'inactive', 'suspended') FOR UPDATE`, [inviteeUserId]);
    if (existingMembership.rows[0]) throw new Error('User already has a squad membership');
    const member = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [invitation.rows[0].squad_id, inviteeUserId]);
    await client.query(`UPDATE squad_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`, [invitationId]);
    return member.rows[0];
  });
}

async function activateOnVerifiedActivity(client, userId) {
  const result = await client.query(`UPDATE squad_memberships SET status = 'active' WHERE user_id = $1 AND status = 'inactive' RETURNING id, squad_id, user_id, status`, [userId]);
  return result.rows[0] || null;
}

async function ensureReferralSquadFormation({ referrerUserId, referredUserId }) {
  const referrer = Number(referrerUserId);
  const referred = Number(referredUserId);
  if (!Number.isInteger(referrer) || referrer <= 0) throw new Error('referrerUserId must be a positive integer');
  if (!Number.isInteger(referred) || referred <= 0) throw new Error('referredUserId must be a positive integer');
  if (referrer === referred) throw new Error('Self referral is not allowed');

  return withTransaction(async client => {
    const firstUserId = Math.min(referrer, referred);
    const secondUserId = Math.max(referrer, referred);
    const users = await client.query('SELECT id FROM users WHERE id IN ($1, $2) ORDER BY id FOR UPDATE', [firstUserId, secondUserId]);
    if (users.rowCount !== 2) throw new Error('Referral Squad formation requires both users to exist');
    const memberships = await client.query(`SELECT user_id, squad_id, status FROM squad_memberships WHERE user_id IN ($1, $2) AND status IN ('active', 'inactive', 'suspended') ORDER BY user_id FOR UPDATE`, [firstUserId, secondUserId]);
    const byUserId = new Map(memberships.rows.map(row => [Number(row.user_id), row]));
    const referrerMembership = byUserId.get(referrer) || null;
    const referredMembership = byUserId.get(referred) || null;
    if (referrerMembership && referredMembership) {
      if (String(referrerMembership.squad_id) === String(referredMembership.squad_id)) return { formed: false, joined: false, rejected: false, squadId: referrerMembership.squad_id, reason: 'already_same_squad' };
      return { formed: false, joined: false, rejected: true, squadId: null, reason: 'different_squads' };
    }
    if (!referrerMembership && referredMembership) return { formed: false, joined: false, rejected: true, squadId: null, reason: 'referrer_without_squad_referred_with_squad' };
    if (referrerMembership) {
      const member = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [referrerMembership.squad_id, referred]);
      return { formed: false, joined: true, rejected: false, squadId: member.rows[0].squad_id, membership: member.rows[0], reason: 'joined_referrer_squad' };
    }
    const squad = await client.query(`INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id, owner_user_id`, [referrer]);
    const squadId = squad.rows[0].id;
    const members = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive'), ($1, $3, 'inactive') RETURNING id, squad_id, user_id, status`, [squadId, referrer, referred]);
    return { formed: true, joined: false, rejected: false, squadId, ownerUserId: referrer, memberships: members.rows, reason: 'created_for_referral' };
  });
}

async function selectPaidMembershipTier(client, maxMembers) {
  const tiers = await getPaidMembershipTiers(client);
  return tiers.find(tier => tier.maxMembers === maxMembers) || (maxMembers === null ? tiers.find(tier => tier.maxMembers === null) : null);
}

async function selectEligibleSquad(client, tier, excludedSquadId = null) {
  const result = await client.query(`SELECT s.id, COUNT(sm.id)::int AS member_count FROM squads s LEFT JOIN squad_memberships sm ON sm.squad_id = s.id AND sm.status IN ('active', 'inactive', 'suspended') WHERE ($3::bigint IS NULL OR s.id <> $3) GROUP BY s.id HAVING COUNT(sm.id) >= $1 AND ($2::int IS NULL OR COUNT(sm.id) <= $2) ORDER BY COUNT(sm.id) ASC, s.id ASC`, [tier.minMembers, tier.maxMembers, excludedSquadId]);
  for (const candidate of result.rows) {
    const locked = await client.query('SELECT id FROM squads WHERE id = $1 FOR UPDATE SKIP LOCKED', [candidate.id]);
    if (!locked.rowCount) continue;
    const count = await client.query(`SELECT COUNT(*)::int AS member_count FROM squad_memberships WHERE squad_id = $1 AND status IN ('active', 'inactive', 'suspended')`, [candidate.id]);
    const memberCount = Number(count.rows[0]?.member_count || 0);
    if (memberCount >= tier.minMembers && (tier.maxMembers === null || memberCount <= tier.maxMembers)) return locked.rows[0];
  }
  return null;
}

async function getCurrentMembership(client, userId) {
  const result = await client.query(`SELECT id, squad_id, user_id, status, joined_at FROM squad_memberships WHERE user_id = $1 AND status IN ('active', 'inactive', 'suspended') FOR UPDATE`, [userId]);
  return result.rows[0] || null;
}

async function getMembershipPurchase(client, userId, joinedAt) {
  const result = await client.query(`SELECT id, metadata FROM ledger_transactions WHERE user_id = $1 AND transaction_type IN ('SQUAD_MEMBERSHIP_PURCHASE', 'SQUAD_MEMBERSHIP_UPGRADE') AND created_at >= $2 ORDER BY created_at ASC, id ASC LIMIT 1 FOR SHARE`, [userId, joinedAt]);
  return result.rows[0] || null;
}

function getPurchaseSnapshot(transaction) {
  const metadata = transaction?.metadata || {};
  const tier = metadata.tier || {};
  const price = Number(metadata.price);
  if (!Number.isInteger(tier.minMembers) || (!Number.isInteger(tier.maxMembers) && tier.maxMembers !== null) || tier.minMembers < 1 || (tier.maxMembers !== null && tier.maxMembers < tier.minMembers) || !Number.isFinite(price) || price <= 0) throw new Error('Current Squad membership purchase metadata is invalid');
  return { price, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers } };
}

async function calculateSquadSwitchTax(client, originalPrice) {
  const result = await client.query("SELECT value FROM admin_settings WHERE key = 'economy.dzx_per_dzp'");
  const rate = result.rows[0]?.value ?? DZP_DZX;
  const originalPriceScaled = decimalToScaled(originalPrice, 'original Squad membership price');
  const rateScaled = decimalToScaled(rate, 'economy.dzx_per_dzp');
  if (rateScaled <= 0n) throw new Error('Invalid economy.dzx_per_dzp configuration');
  const taxDzpScaled = multiplyRatioScaled(originalPriceScaled, 1n, 10n);
  return scaledToDecimal(multiplyScaled(taxDzpScaled, rateScaled));
}

function validateMembershipOperationInput({ userId, idempotencyKey }) {
  if (!userId) throw new Error('userId is required');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
}

async function getExistingOperation(client, transactionKey, type) {
  const result = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [transactionKey]);
  if (!result.rowCount) return null;
  const transaction = result.rows[0];
  if (transaction.transaction_type !== type) throw new Error('Idempotency key operation mismatch');
  return transaction.metadata || {};
}

function membershipResponse(membership) {
  return { id: membership.id, squad_id: membership.squad_id, user_id: membership.user_id, status: membership.status };
}

async function switchSquadWithinTier({ userId, idempotencyKey }) {
  validateMembershipOperationInput({ userId, idempotencyKey });
  return withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const transactionKey = `squad-membership-switch:${userId}:${idempotencyKey}`;
    const duplicate = await getExistingOperation(client, transactionKey, 'SQUAD_MEMBERSHIP_SWITCH');
    if (duplicate) return { duplicate: true, membership: duplicate.membership, taxDzx: duplicate.tax_dzx, tier: duplicate.tier };
    const current = await getCurrentMembership(client, userId);
    if (!current || !['active', 'inactive'].includes(current.status)) throw new Error('Active or inactive Squad membership is required to switch Squads');
    const purchase = await getMembershipPurchase(client, userId, current.joined_at);
    if (!purchase) throw new Error('Current Squad membership has no paid purchase record');
    const snapshot = getPurchaseSnapshot(purchase);
    const taxDzx = await calculateSquadSwitchTax(client, snapshot.price);
    const target = await selectEligibleSquad(client, snapshot.tier, current.squad_id);
    if (!target) throw new Error('No other Squad is currently available in your membership tier');
    const membership = await client.query(`UPDATE squad_memberships SET squad_id = $1 WHERE id = $2 RETURNING id, squad_id, user_id, status`, [target.id, current.id]);
    const economy = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId, type: 'SQUAD_MEMBERSHIP_SWITCH', movements: [{ currency: 'DZX', amount: `-${taxDzx}`, source: 'squad_membership_switch' }], metadata: { source: 'squad_membership_switch', membership: membershipResponse(membership.rows[0]), old_squad_id: current.squad_id, new_squad_id: target.id, tax_dzx: taxDzx, tax_dzp: scaledToDecimal(multiplyRatioScaled(decimalToScaled(snapshot.price, 'original Squad membership price'), 1n, 10n)), tier: snapshot.tier } });
    return { duplicate: false, membership: membership.rows[0], taxDzx, tier: snapshot.tier, transaction: economy.transaction };
  });
}

function validateUpgradeContext(current, purchase, tier) {
  if (!current || !['active', 'inactive'].includes(current.status)) throw new Error('Active or inactive Squad membership is required to upgrade');
  if (!purchase) throw new Error('Current Squad membership has no paid purchase record');
  const snapshot = getPurchaseSnapshot(purchase);
  if (tier.maxMembers !== null && snapshot.tier.maxMembers !== null && tier.maxMembers <= snapshot.tier.maxMembers) throw new Error('Upgrade tier must be higher than the current membership tier');
  if (tier.maxMembers === snapshot.tier.maxMembers) throw new Error('Upgrade tier must be higher than the current membership tier');
  return snapshot;
}

async function upgradeSquadTier({ userId, newMaxMembers, idempotencyKey }) {
  validateMembershipOperationInput({ userId, idempotencyKey });
  if (!Number.isInteger(newMaxMembers) || newMaxMembers <= 0) throw new Error('newMaxMembers must be a positive integer');
  return withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const transactionKey = `squad-membership-upgrade:${userId}:${idempotencyKey}`;
    const duplicate = await getExistingOperation(client, transactionKey, 'SQUAD_MEMBERSHIP_UPGRADE');
    if (duplicate) return { duplicate: true, membership: duplicate.membership, price: duplicate.price, tier: duplicate.tier };
    const current = await getCurrentMembership(client, userId);
    const purchase = current ? await getMembershipPurchase(client, userId, current.joined_at) : null;
    const tier = await selectPaidMembershipTier(client, newMaxMembers);
    if (!tier) throw new Error('Requested Squad membership tier is unavailable');
    const snapshot = validateUpgradeContext(current, purchase, tier);
    const target = await selectEligibleSquad(client, tier);
    if (!target) throw new Error('No Squad is currently available in the requested tier');
    await client.query(`UPDATE squad_memberships SET status = 'cancelled' WHERE id = $1`, [current.id]);
    const replacement = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [target.id, userId]);
    const economy = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId, type: 'SQUAD_MEMBERSHIP_UPGRADE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership_upgrade' }], metadata: { source: 'squad_membership_upgrade', membership: membershipResponse(replacement.rows[0]), old_membership_id: current.id, old_squad_id: current.squad_id, new_squad_id: target.id, price: tier.price, tier } });
    return { duplicate: false, membership: replacement.rows[0], price: tier.price, tier, transaction: economy.transaction };
  });
}

async function lockPaidMembershipTier(client, tier) {
  const key = `${tier.minMembers}:${tier.maxMembers === null ? 'unbounded' : tier.maxMembers}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`squad-paid-membership:${key}`]);
}

async function getPendingPurchaseRequest(client, userId, idempotencyKey = null) {
  if (idempotencyKey) {
    const byKey = await client.query(`SELECT id, user_id, min_members, max_members, price, status, created_at, settled_at FROM squad_membership_purchase_requests WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`, [userId, idempotencyKey]);
    if (byKey.rows[0]) return byKey.rows[0];
  }
  const pending = await client.query(`SELECT id, user_id, min_members, max_members, price, status, created_at, settled_at FROM squad_membership_purchase_requests WHERE user_id = $1 AND status = 'pending' FOR UPDATE`, [userId]);
  return pending.rows[0] || null;
}

async function getDzpBalanceForUpdate(client, userId) {
  const result = await client.query(`SELECT balance FROM wallet_accounts WHERE user_id = $1 AND currency = 'DZP' FOR UPDATE`, [userId]);
  if (!result.rows[0]) throw new Error('DZP wallet not found');
  return Number(result.rows[0].balance);
}

async function settlePaidMembershipRequest(client, request, tier, transactionKey) {
  const squad = await selectEligibleSquad(client, tier);
  if (!squad) return null;
  const economy = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId: request.user_id, type: 'SQUAD_MEMBERSHIP_PURCHASE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership' }], metadata: { source: 'squad_membership', squad_id: squad.id, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers }, price: tier.price, purchase_request_id: request.id } });
  if (economy.duplicate) throw new Error('Squad membership purchase transaction unexpectedly duplicated');
  const membership = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [squad.id, request.user_id]);
  await client.query(`UPDATE squad_membership_purchase_requests SET status = 'settled', settled_at = NOW() WHERE id = $1`, [request.id]);
  return { membership: membership.rows[0], price: tier.price, tier, transaction: economy.transaction };
}

async function purchasePaidMembership({ userId, maxMembers, idempotencyKey }) {
  if (!userId) throw new Error('userId is required');
  if (!(Number.isInteger(maxMembers) || maxMembers === null) || (Number.isInteger(maxMembers) && maxMembers <= 0)) throw new Error('maxMembers must be a positive integer or null for the unbounded tier');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  return withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const tier = await selectPaidMembershipTier(client, maxMembers);
    if (!tier) throw new Error('Requested Squad membership tier is unavailable');
    await lockPaidMembershipTier(client, tier);

    const transactionKey = `squad-membership:${userId}:${idempotencyKey}`;
    const existingTransaction = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [transactionKey]);
    if (existingTransaction.rowCount) {
      const metadata = existingTransaction.rows[0].metadata || {};
      const sameTier = Number(metadata.tier?.minMembers) === tier.minMembers && (metadata.tier?.maxMembers === null ? tier.maxMembers === null : Number(metadata.tier?.maxMembers) === tier.maxMembers);
      if (!sameTier) throw new Error('Idempotency key is bound to another Squad membership tier');
      const membership = await client.query(`SELECT id, squad_id, user_id, status FROM squad_memberships WHERE user_id = $1 AND status IN ('active', 'inactive', 'suspended')`, [userId]);
      if (!membership.rowCount) throw new Error('Existing Squad membership purchase cannot be reconciled');
      return { duplicate: true, status: 'settled', membership: membership.rows[0], price: Number(metadata.price), tier: metadata.tier, transaction: existingTransaction.rows[0] };
    }

    const existingMembership = await client.query(`SELECT id FROM squad_memberships WHERE user_id = $1 AND status IN ('active', 'inactive', 'suspended') FOR UPDATE`, [userId]);
    if (existingMembership.rowCount) throw new Error('User already has an eligible Squad membership');

    let request = await getPendingPurchaseRequest(client, userId, idempotencyKey);
    if (request) {
      if (Number(request.min_members) !== tier.minMembers || (request.max_members === null ? tier.maxMembers !== null : Number(request.max_members) !== tier.maxMembers)) throw new Error('Idempotency key is bound to another Squad membership tier');
      if (request.status === 'settled') throw new Error('Settled Squad membership request cannot be reconciled without its purchase transaction');
      const balance = await getDzpBalanceForUpdate(client, userId);
      if (balance < tier.price) throw new Error('Insufficient DZP balance for Squad membership');
      const settled = await settlePaidMembershipRequest(client, request, tier, transactionKey);
      if (settled) return { duplicate: false, status: 'settled', ...settled };
      return { duplicate: true, status: 'pending', request: { id: request.id, created_at: request.created_at }, price: tier.price, tier };
    }

    const balance = await getDzpBalanceForUpdate(client, userId);
    if (balance < tier.price) throw new Error('Insufficient DZP balance for Squad membership');

    const squad = await selectEligibleSquad(client, tier);
    if (squad) {
      const economy = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId, type: 'SQUAD_MEMBERSHIP_PURCHASE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership' }], metadata: { source: 'squad_membership', squad_id: squad.id, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers }, price: tier.price } });
      if (economy.duplicate) throw new Error('Squad membership purchase transaction unexpectedly duplicated');
      const membership = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [squad.id, userId]);
      return { duplicate: false, status: 'settled', membership: membership.rows[0], price: tier.price, tier, transaction: economy.transaction };
    }

    const pending = await client.query(`SELECT id, user_id, min_members, max_members, price, status, created_at, settled_at FROM squad_membership_purchase_requests WHERE min_members = $1 AND max_members IS NOT DISTINCT FROM $2 AND status = 'pending' ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE`, [tier.minMembers, tier.maxMembers]);
    if (!pending.rows[0]) {
      const created = await client.query(`INSERT INTO squad_membership_purchase_requests (user_id, idempotency_key, min_members, max_members, price, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id, created_at`, [userId, idempotencyKey, tier.minMembers, tier.maxMembers, tier.price]);
      return { duplicate: false, status: 'pending', request: created.rows[0], price: tier.price, tier };
    }

    const first = pending.rows[0];
    const firstBalance = await getDzpBalanceForUpdate(client, first.user_id);
    if (firstBalance < tier.price) throw new Error('Pending Squad membership request is no longer affordable');
    const secondBalance = await getDzpBalanceForUpdate(client, userId);
    if (secondBalance < tier.price) throw new Error('Insufficient DZP balance for Squad membership');

    const squadResult = await client.query(`INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id, owner_user_id`, [first.user_id]);
    const squadId = squadResult.rows[0].id;
    const firstMembership = await postEconomyTransactionOnClient(client, { idempotencyKey: `squad-membership:${first.user_id}:${first.idempotency_key}`, userId: first.user_id, type: 'SQUAD_MEMBERSHIP_PURCHASE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership' }], metadata: { source: 'squad_membership', squad_id: squadId, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers }, price: tier.price, purchase_request_id: first.id } });
    const secondMembership = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId, type: 'SQUAD_MEMBERSHIP_PURCHASE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership' }], metadata: { source: 'squad_membership', squad_id: squadId, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers }, price: tier.price, purchase_request_id: 'current' } });
    if (firstMembership.duplicate || secondMembership.duplicate) throw new Error('Squad membership purchase transaction unexpectedly duplicated');
    const members = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive'), ($1, $3, 'inactive') RETURNING id, squad_id, user_id, status`, [squadId, first.user_id, userId]);
    await client.query(`UPDATE squad_membership_purchase_requests SET status = 'settled', settled_at = NOW() WHERE id = $1`, [first.id]);
    return { duplicate: false, status: 'settled', membership: members.rows.find(row => String(row.user_id) === String(userId)), settledMemberships: members.rows, price: tier.price, tier, transaction: secondMembership.transaction, ownerUserId: first.user_id, settledRequestId: first.id };
  });
}

module.exports = { createInvitation, acceptInvitation, activateOnVerifiedActivity, ensureReferralSquadFormation, getPaidMembershipTiers, getCurrentSquadTier, purchasePaidMembership, switchSquadWithinTier, upgradeSquadTier };