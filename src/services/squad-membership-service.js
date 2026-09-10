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
  { minMembers: 201, maxMembers: 300, price: 3000 }
];

async function getPaidMembershipTiers(client = null) {
  const execute = client ? client.query.bind(client) : query;
  const result = await execute("SELECT value FROM admin_settings WHERE key = 'squad.membership_tiers'");
  if (!result.rowCount) return DEFAULT_PAID_TIERS;
  const tiers = result.rows[0].value;
  if (!Array.isArray(tiers)) throw new Error('Invalid Squad membership tier configuration');
  const normalized = tiers.map(tier => ({
    minMembers: Number(tier.minMembers),
    maxMembers: Number(tier.maxMembers),
    price: Number(tier.price)
  }));
  if (!normalized.length || normalized.some(tier => !Number.isInteger(tier.minMembers) || !Number.isInteger(tier.maxMembers) || tier.minMembers < 1 || tier.maxMembers < tier.minMembers || !Number.isInteger(tier.price) || tier.price <= 0)) {
    throw new Error('Invalid Squad membership tier configuration');
  }
  return normalized.sort((a, b) => a.minMembers - b.minMembers);
}

async function createInvitation({ squadId, inviterUserId, inviteeUserId }) {
  return withTransaction(async client => {
    const owner = await client.query('SELECT 1 FROM squads WHERE id = $1 AND owner_user_id = $2 FOR UPDATE', [squadId, inviterUserId]);
    if (!owner.rows[0]) throw new Error('Only the squad owner can invite');
    const existing = await client.query(`SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled' UNION ALL SELECT 1 FROM squad_invitations WHERE invitee_user_id = $1 AND status = 'pending' LIMIT 1`, [inviteeUserId]);
    if (existing.rows[0]) throw new Error('User is already assigned to a squad or has a pending invitation');
    const result = await client.query(`INSERT INTO squad_invitations (squad_id, inviter_user_id, invitee_user_id) VALUES ($1, $2, $3) RETURNING id, squad_id, invitee_user_id, status, created_at`, [squadId, inviterUserId, inviteeUserId]);
    return result.rows[0];
  });
}

async function acceptInvitation({ invitationId, inviteeUserId }) {
  return withTransaction(async client => {
    const invitation = await client.query(`SELECT id, squad_id FROM squad_invitations WHERE id = $1 AND invitee_user_id = $2 AND status = 'pending' FOR UPDATE`, [invitationId, inviteeUserId]);
    if (!invitation.rows[0]) throw new Error('Invitation is not pending');
    const existingMembership = await client.query(`SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled' FOR UPDATE`, [inviteeUserId]);
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

async function selectPaidMembershipTier(client, maxMembers) {
  const tiers = await getPaidMembershipTiers(client);
  return tiers.find(tier => tier.maxMembers === maxMembers) || null;
}

async function selectEligibleSquad(client, tier, excludedSquadId = null) {
  const result = await client.query(`SELECT s.id, COUNT(sm.id)::int AS member_count FROM squads s LEFT JOIN squad_memberships sm ON sm.squad_id = s.id AND sm.status <> 'cancelled' WHERE ($3::bigint IS NULL OR s.id <> $3) GROUP BY s.id HAVING COUNT(sm.id) BETWEEN $1 AND $2 ORDER BY COUNT(sm.id) ASC, s.id ASC`, [tier.minMembers, tier.maxMembers, excludedSquadId]);
  for (const candidate of result.rows) {
    const locked = await client.query('SELECT id FROM squads WHERE id = $1 FOR UPDATE SKIP LOCKED', [candidate.id]);
    if (!locked.rowCount) continue;
    const count = await client.query(`SELECT COUNT(*)::int AS member_count FROM squad_memberships WHERE squad_id = $1 AND status <> 'cancelled'`, [candidate.id]);
    const memberCount = Number(count.rows[0]?.member_count || 0);
    if (memberCount >= tier.minMembers && memberCount <= tier.maxMembers) return locked.rows[0];
  }
  return null;
}

async function getCurrentMembership(client, userId) {
  const result = await client.query(`SELECT id, squad_id, user_id, status, joined_at FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled' FOR UPDATE`, [userId]);
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
  if (!Number.isInteger(tier.minMembers) || !Number.isInteger(tier.maxMembers) || tier.minMembers < 1 || tier.maxMembers < tier.minMembers || !Number.isFinite(price) || price <= 0) throw new Error('Current Squad membership purchase metadata is invalid');
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

async function upgradeSquadTier({ userId, newMaxMembers, idempotencyKey }) {
  validateMembershipOperationInput({ userId, idempotencyKey });
  if (!Number.isInteger(newMaxMembers) || newMaxMembers <= 0) throw new Error('newMaxMembers must be a positive integer');
  return withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const transactionKey = `squad-membership-upgrade:${userId}:${idempotencyKey}`;
    const duplicate = await getExistingOperation(client, transactionKey, 'SQUAD_MEMBERSHIP_UPGRADE');
    if (duplicate) return { duplicate: true, membership: duplicate.membership, price: duplicate.price, tier: duplicate.tier };
    const current = await getCurrentMembership(client, userId);
    if (!current || !['active', 'inactive'].includes(current.status)) throw new Error('Active or inactive Squad membership is required to upgrade');
    const purchase = await getMembershipPurchase(client, userId, current.joined_at);
    if (!purchase) throw new Error('Current Squad membership has no paid purchase record');
    const snapshot = getPurchaseSnapshot(purchase);
    const tier = await selectPaidMembershipTier(client, newMaxMembers);
    if (!tier) throw new Error('Requested Squad membership tier is unavailable');
    if (tier.maxMembers <= snapshot.tier.maxMembers) throw new Error('Upgrade tier must be higher than the current membership tier');
    const target = await selectEligibleSquad(client, tier);
    if (!target) throw new Error('No Squad is currently available in the requested tier');
    const replacement = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [target.id, userId]);
    const economy = await postEconomyTransactionOnClient(client, { idempotencyKey: transactionKey, userId, type: 'SQUAD_MEMBERSHIP_UPGRADE', movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership_upgrade' }], metadata: { source: 'squad_membership_upgrade', membership: membershipResponse(replacement.rows[0]), old_membership_id: current.id, old_squad_id: current.squad_id, new_squad_id: target.id, price: tier.price, tier } });
    await client.query(`UPDATE squad_memberships SET status = 'cancelled' WHERE id = $1`, [current.id]);
    return { duplicate: false, membership: replacement.rows[0], price: tier.price, tier, transaction: economy.transaction };
  });
}

async function purchasePaidMembership({ userId, maxMembers, idempotencyKey }) {
  if (!userId) throw new Error('userId is required');
  if (!Number.isInteger(maxMembers) || maxMembers <= 0) throw new Error('maxMembers must be a positive integer');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  return withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const transactionKey = `squad-membership:${userId}:${idempotencyKey}`;
    const existingTransaction = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1 FOR SHARE', [transactionKey]);
    if (existingTransaction.rowCount) {
      const metadata = existingTransaction.rows[0].metadata || {};
      const requestedTier = await selectPaidMembershipTier(client, maxMembers);
      if (!requestedTier || Number(metadata.price) !== requestedTier.price || Number(metadata.tier?.maxMembers) !== requestedTier.maxMembers) throw new Error('Idempotency key is bound to another Squad membership tier');
      const membership = await client.query(`SELECT id, squad_id, user_id, status FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled'`, [userId]);
      if (!membership.rowCount || String(metadata.squad_id) !== String(membership.rows[0].squad_id)) throw new Error('Existing Squad membership purchase cannot be reconciled');
      return { duplicate: true, membership: membership.rows[0], price: Number(metadata.price), tier: metadata.tier };
    }
    const existingMembership = await client.query(`SELECT id FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled' FOR UPDATE`, [userId]);
    if (existingMembership.rowCount) throw new Error('User already has an eligible Squad membership');
    const tier = await selectPaidMembershipTier(client, maxMembers);
    if (!tier) throw new Error('Requested Squad membership tier is unavailable');
    const squad = await selectEligibleSquad(client, tier);
    if (!squad) throw new Error('No Squad is currently available in the requested tier');
    const economy = await postEconomyTransactionOnClient(client, {
      idempotencyKey: transactionKey,
      userId,
      type: 'SQUAD_MEMBERSHIP_PURCHASE',
      movements: [{ currency: 'DZP', amount: -tier.price, source: 'squad_membership' }],
      metadata: { source: 'squad_membership', squad_id: squad.id, tier: { minMembers: tier.minMembers, maxMembers: tier.maxMembers }, price: tier.price }
    });
    if (economy.duplicate) throw new Error('Squad membership purchase transaction unexpectedly duplicated');
    const membership = await client.query(`INSERT INTO squad_memberships (squad_id, user_id, status) VALUES ($1, $2, 'inactive') RETURNING id, squad_id, user_id, status`, [squad.id, userId]);
    return { duplicate: false, membership: membership.rows[0], price: tier.price, tier, transaction: economy.transaction };
  });
}

module.exports = { createInvitation, acceptInvitation, activateOnVerifiedActivity, getPaidMembershipTiers, purchasePaidMembership, switchSquadWithinTier, upgradeSquadTier };
