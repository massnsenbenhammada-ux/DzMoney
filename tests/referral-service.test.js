// Phase 3 TDD: Referral contract tests are added before production implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReferralService, referralCode } = require('../src/services/referral-service');

function fakeDb() {
  const users = new Map(); const referrals = new Map(); const rewards = new Set();
  return {
    async createUser(id) { const user = { id: users.size + 1, telegram_user_id: String(id) }; users.set(String(id), user); return user; },
    async findReferralByReferredUserId(id) { return [...referrals.values()].find(r => r.referred_id === id) || null; },
    async findReferralById(id) { return referrals.get(id) || null; },
    async createReferral(referrerId, referredId, code) { const row = { id: referrals.size + 1, referrer_id: referrerId, referred_id: referredId, referral_code: code, status: 'pending' }; referrals.set(row.id, row); return row; },
    async countQualifiedReferrals(referrerId) { return [...referrals.values()].filter(r => r.referrer_id === referrerId && r.status === 'qualified').length; },
    async markQualified(referralId, activityId) { const row = referrals.get(referralId); row.status = 'qualified'; row.qualification_activity_id = activityId; return row; },
    async activateReferral(referralId) { const key = `activation:${referralId}`; if (rewards.has(key)) return { duplicate: true }; rewards.add(key); return { duplicate: false }; },
    async creditLifetimeReferralReward(referralId, activityId, baseReward) { const key = `lifetime:${activityId}`; if (rewards.has(key)) return { duplicate: true }; rewards.add(key); return { duplicate: false, reward: { coin: baseReward.coin * 0.2, dzx: baseReward.dzx * 0.2, dzp: baseReward.dzp * 0.2 } }; }
  };
}

test('referral code is canonical and deterministic', () => {
  assert.equal(referralCode(1), 'DZ1');
  assert.equal(referralCode(35), 'DZ Z'.replace(' ', ''));
  assert.throws(() => referralCode(0), /userId is required/);
});

test('referral attribution is one-level and immutable', async () => {
  const db = fakeDb(); const service = createReferralService(db);
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

test('lifetime attribution is 20 percent of base activity reward and idempotent', async () => {
  const db = fakeDb(); const service = createReferralService(db);
  const a = await db.createUser(100); const b = await db.createUser(200);
  const ref = await service.attribute({ referrerUserId: a.id, referredUserId: b.id, referralCode: 'A' });
  await service.qualify({ referralId: ref.id, activityId: 'task:1', evidenceVerified: true });
  const first = await service.creditLifetime({ referralId: ref.id, activityId: 'task:1', baseReward: { coin: 1000, dzx: 1, dzp: 1 } });
  const second = await service.creditLifetime({ referralId: ref.id, activityId: 'task:1', baseReward: { coin: 1000, dzx: 1, dzp: 1 } });
  assert.deepEqual(first.reward, { coin: 200, dzx: 0.2, dzp: 0.2 });
  assert.equal(second.duplicate, true);
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
