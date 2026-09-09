const test = require('node:test');
const assert = require('node:assert/strict');
const { query } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const promoService = require('../src/services/promo-code-service');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createdCampaigns = [];
const createdUsers = [];

async function createTestUser(label) {
  const user = await walletService.createUser({
    telegramUserId: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    username: `promo_${label}_${suffix}`,
    firstName: 'Promo Test',
  });
  createdUsers.push(user.id);
  return user;
}

const providerRegistry = new AdProviderRegistry([
  {
    id: 'promo-test-provider',
    contexts: ['promo'],
    enabled: true,
    async verifyCompletion(payload) {
      return payload?.accepted === true
        ? {
            verified: true,
            reference: payload.reference || `promo-test:${suffix}`,
            metadata: { test: true },
          }
        : { verified: false };
    },
  },
]);

async function cleanup() {
  if (createdCampaigns.length) {
    await query(
      'DELETE FROM promo_redemptions WHERE campaign_id = ANY($1::bigint[])',
      [createdCampaigns],
    );
    await query('DELETE FROM promo_campaigns WHERE id = ANY($1::bigint[])', [
      createdCampaigns,
    ]);
  }
  if (createdUsers.length) {
    await query(
      `DELETE FROM ledger_entries WHERE wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id = ANY($1::bigint[]))`,
      [createdUsers],
    );
    await query(
      `DELETE FROM ledger_transactions WHERE user_id = ANY($1::bigint[])`,
      [createdUsers],
    );
    await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [
      createdUsers,
    ]);
  }
}

test.after(cleanup);

test('promo redemption credits COIN without an ad when campaign explicitly disables ad gating', async () => {
  const user = await createTestUser('coin');
  const campaign = await promoService.createPromoCampaign({
    code: `COIN-${suffix}`,
    rewardCurrency: 'COIN',
    rewardAmount: '1234',
    maxRedemptions: 1,
    perUserLimit: 1,
    adGated: false,
    enabled: true,
  });
  createdCampaigns.push(campaign.id);
  const before = await query(
    "SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='COIN'",
    [user.id],
  );
  const result = await promoService.redeemPromoCode({
    userId: user.id,
    code: campaign.code,
    idempotencyKey: `promo-test:${suffix}:coin`,
  });
  assert.equal(result.status, 'verified');
  const after = await query(
    "SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='COIN'",
    [user.id],
  );
  assert.equal(
    Number(after.rows[0].balance) - Number(before.rows[0].balance),
    1234,
  );
  await assert.rejects(
    () =>
      promoService.redeemPromoCode({
        userId: user.id,
        code: campaign.code,
        idempotencyKey: `promo-test:${suffix}:coin-2`,
      }),
    /already used|usage limit/,
  );
});

test('ad-gated promo finalization credits DZX exactly once and records promo source', async () => {
  const user = await createTestUser('dzx');
  const campaign = await promoService.createPromoCampaign({
    code: `DZX-${suffix}`,
    rewardCurrency: 'DZX',
    rewardAmount: '2',
    maxRedemptions: 5,
    perUserLimit: 1,
    adGated: true,
    enabled: true,
  });
  createdCampaigns.push(campaign.id);
  const before = await query(
    "SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'",
    [user.id],
  );
  const claim = await promoService.redeemPromoCode({
    userId: user.id,
    code: campaign.code,
    idempotencyKey: `promo-test:${suffix}:dzx`,
    providerRegistry,
  });
  assert.equal(claim.status, 'pending');
  assert.ok(claim.adEventId);
  const first = await promoService.finalizePromoRedemption({
    userId: user.id,
    adEventId: claim.adEventId,
    providerRegistry,
    providerId: 'promo-test-provider',
    providerPayload: { accepted: true, reference: `ref:${suffix}` },
  });
  assert.equal(first.status, 'verified');
  assert.equal(first.rewarded, true);
  const second = await promoService.finalizePromoRedemption({
    userId: user.id,
    adEventId: claim.adEventId,
    providerRegistry,
    providerId: 'promo-test-provider',
    providerPayload: { accepted: true, reference: `ref:${suffix}` },
  });
  assert.equal(second.duplicate, true);
  const after = await query(
    "SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'",
    [user.id],
  );
  assert.equal(
    Number(after.rows[0].balance) - Number(before.rows[0].balance),
    2,
  );
  const ledger = await query(
    `SELECT le.source,le.currency,le.amount FROM ledger_entries le JOIN ledger_transactions lt ON lt.id=le.transaction_id WHERE lt.user_id=$1 AND lt.idempotency_key=$2`,
    [user.id, `promo:reward:${first.id}`],
  );
  assert.equal(ledger.rowCount, 1);
  assert.equal(ledger.rows[0].source, 'promo');
  assert.equal(ledger.rows[0].currency, 'DZX');
  assert.equal(Number(ledger.rows[0].amount), 2);
});

test('promo campaign max redemptions is serialized under concurrent claims', async () => {
  const users = await Promise.all([
    createTestUser('race-a'),
    createTestUser('race-b'),
  ]);
  const campaign = await promoService.createPromoCampaign({
    code: `RACE-${suffix}`,
    rewardCurrency: 'COIN',
    rewardAmount: '5',
    maxRedemptions: 1,
    perUserLimit: 1,
    adGated: false,
    enabled: true,
  });
  createdCampaigns.push(campaign.id);
  const results = await Promise.allSettled(
    users.map((user, index) =>
      promoService.redeemPromoCode({
        userId: user.id,
        code: campaign.code,
        idempotencyKey: `promo-test:${suffix}:race:${index}`,
      }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    1,
  );
});
