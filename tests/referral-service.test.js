// Phase 3 TDD: Referral contract tests are added before production implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReferralService } = require('../src/services/referral-service');

function fakeDb() {
  const users = new Map();
  const referrals = new Map();
  const rewards = new Set();
  return {
    async createUser(id) { const user = { id: users.size + 1, telegram_user_id: String(id) }; users.set(String(id), user); return user; },
    async findReferralByReferredUserId(id) { return referrals.get(id) || null; },
    async createReferral(referrerId, referredId, code) { const row = { id: referrals.size + 1, referrer_id: referrerId, referred_id: referredId, referral_code: code, status: 'pending' }; referrals.set(referredId, row); return row; },
    async countQualifiedReferrals(referrerId) { return [...referrals.values()].filter(r => r.referrer_id === referrerId && r.status === 'qualified').length; },
    async markQualified(referralId, activityId) { const row = [...referrals.values()].find(r => r.id === referralId); row.status = 'qualified'; row.qualification_activity_id = activityId; return row; },
    async hasActivationReward(referralId) { return rewards.has(`activation:${referralId}`); },
    async recordActivationReward(referralId) { rewards.add(`activation:${referralId}`); return { recorded: true }; },
    _referrals: referrals
  };
}

test('referral attribution is one-level and immutable', async () => {
  const db = fakeDb();
  const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200); const c = await db.createUser(300);
  await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  await assert.rejects(() => service.attribute({ referrerUserId: c.id, referredUserId: b.id, referralCode: 'C' }), /already attributed/);
  await assert.rejects(() => service.attribute({ referrerUserId: b.id, referredUserId: b.id, referralCode: 'B' }), /self-referral/);
});

test('qualification requires verified activity', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200);
  const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  assert.equal(ref.status, 'pending');
  const qualified = await service.qualify({ referralId: ref.id, activityId: 'task:1', evidenceVerified: true });
  assert.equal(qualified.status, 'qualified');
});

test('unverified activity cannot qualify a referral', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200);
  const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  await assert.rejects(() => service.qualify({ referralId: ref.id, activityId: 'task:1', evidenceVerified: false }), /verified activity/);
});

test('qualification is idempotent', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200);
  const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  const first = await service.qualify({ referralId: ref.id, activityId: 'task:1', evidenceVerified: true });
  const second = await service.qualify({ referralId: ref.id, activityId: 'task:1', evidenceVerified: true });
  assert.equal(first.status, 'qualified'); assert.equal(second.status, 'qualified');
});

test('activation reward is once per qualified referral', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200);
  const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  await service.qualify({ referralId: ref.id, activityId: 'ad:1', evidenceVerified: true });
  assert.equal((await service.activate({ referralId: ref.id })).duplicate, false);
  assert.equal((await service.activate({ referralId: ref.id })).duplicate, true);
});

test('qualified referral count is the achievement source of truth', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100);
  for (let i = 0; i < 10; i += 1) {
    const b = await db.createUser(200 + i);
    const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
    await service.qualify({ referralId: ref.id, activityId: `task:${i}`, evidenceVerified: true });
  }
  assert.equal(await service.getQualifiedCount(a.id), 10);
});
