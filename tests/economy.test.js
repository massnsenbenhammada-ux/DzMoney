"use strict";

const assert = require("node:assert/strict");
const {
  tonToDzx,
  dzxToTon,
  calculateReferralReward,
  isSquadDailyActive,
  resolveSquadBonus,
  calculateActivityReward,
  validateEconomicBudget,
  calculateWithdrawalRequirement
} = require("../services/economy");

assert.equal(tonToDzx(1), 10000);
assert.equal(tonToDzx(0.2), 2000);
assert.equal(dzxToTon(2000), 0.2);

// Referral is based on base activity reward only.
assert.equal(calculateReferralReward(1), 0.2);
assert.equal(calculateReferralReward(1.5), 0.3);

assert.equal(isSquadDailyActive(100, 50).eligible, true);
assert.equal(isSquadDailyActive(100, 49).eligible, false);
assert.equal(isSquadDailyActive(101, 51).eligible, true);
assert.equal(isSquadDailyActive(101, 50).eligible, false);

assert.equal(resolveSquadBonus(100, { eligible: true }), 100);
assert.equal(resolveSquadBonus(100, { eligible: false }), 0);

const reward = calculateActivityReward(1, 100);
assert.equal(reward.totalUserReward, 2);
assert.equal(reward.squadBonusAmount, 1);

assert.equal(validateEconomicBudget(3, { user: 1, squad: 1, treasury: 1 }).valid, true);
assert.equal(validateEconomicBudget(3, { user: 1, squad: 2, treasury: 1 }).valid, false);

const withdrawal = calculateWithdrawalRequirement(0.2);
assert.equal(withdrawal.valid, true);
assert.equal(withdrawal.requiredDzx, 2000);
assert.equal(withdrawal.requiredCoins, 2000000);

console.log("DzMoney economy tests: PASS");
