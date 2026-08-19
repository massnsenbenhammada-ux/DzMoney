"use strict";

// Phase 1 economic primitives. Kept independent so existing wallet/task code
// can be migrated incrementally instead of being rewritten.

const DEFAULT_ECONOMY = Object.freeze({
  dzxPerTon: 10000,
  minimumDepositTon: 1,
  minimumWithdrawalTon: 0.2,
  minimumWithdrawalCoins: 2000000,
  referralPercent: 20,
  squadActivityThresholdPercent: 50,
  maxSquadBonusPercent: 100
});

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percent(value) {
  return Math.min(100, Math.max(0, number(value)));
}

function tonToDzx(ton, rate = DEFAULT_ECONOMY.dzxPerTon) {
  const amount = number(ton);
  const conversion = number(rate, DEFAULT_ECONOMY.dzxPerTon);
  if (amount < 0 || conversion <= 0) throw new Error("Invalid TON/DZX conversion.");
  return Math.round(amount * conversion);
}

function dzxToTon(dzx, rate = DEFAULT_ECONOMY.dzxPerTon) {
  const amount = number(dzx);
  const conversion = number(rate, DEFAULT_ECONOMY.dzxPerTon);
  if (amount < 0 || conversion <= 0) throw new Error("Invalid DZX/TON conversion.");
  return amount / conversion;
}

// Referral is one level and uses BASE activity reward only. Squad bonus is excluded.
function calculateReferralReward(baseReward, referralPercent = DEFAULT_ECONOMY.referralPercent) {
  return Math.max(0, number(baseReward)) * percent(referralPercent) / 100;
}

// At least 50% active today -> Squad bonus becomes eligible for tomorrow.
function isSquadDailyActive(memberCount, activeMemberCount, threshold = DEFAULT_ECONOMY.squadActivityThresholdPercent) {
  const members = Math.max(0, Math.floor(number(memberCount)));
  const active = Math.max(0, Math.floor(number(activeMemberCount)));
  const thresholdPercent = percent(threshold);
  const required = Math.ceil(members * thresholdPercent / 100);
  return {
    eligible: members > 0 && active >= required,
    memberCount: members,
    activeMemberCount: Math.min(active, members),
    requiredActiveMembers: required,
    thresholdPercent
  };
}

function resolveSquadBonus(levelBonus, dailyActivity) {
  const configured = Math.min(DEFAULT_ECONOMY.maxSquadBonusPercent, percent(levelBonus));
  return dailyActivity?.eligible ? configured : 0;
}

function calculateActivityReward(baseReward, squadBonusPercent = 0) {
  const base = Math.max(0, number(baseReward));
  const bonus = Math.min(DEFAULT_ECONOMY.maxSquadBonusPercent, percent(squadBonusPercent));
  return {
    baseReward: base,
    squadBonusPercent: bonus,
    squadBonusAmount: base * bonus / 100,
    totalUserReward: base * (1 + bonus / 100)
  };
}

// Every allocation must fit inside the activity's real economic budget.
function validateEconomicBudget(budget, allocations = {}) {
  const available = Math.max(0, number(budget));
  const total = Object.values(allocations).reduce((sum, value) => sum + Math.max(0, number(value)), 0);
  return {
    valid: total <= available,
    availableBudget: available,
    totalAllocated: total,
    remainingBudget: Math.max(0, available - total),
    deficit: Math.max(0, total - available)
  };
}

function calculateWithdrawalRequirement(amountTon, config = {}) {
  const rate = number(config.dzxPerTon, DEFAULT_ECONOMY.dzxPerTon);
  const minimumTon = Math.max(0, number(config.minimumWithdrawalTon, DEFAULT_ECONOMY.minimumWithdrawalTon));
  const coins = Math.max(0, Math.floor(number(config.minimumWithdrawalCoins, DEFAULT_ECONOMY.minimumWithdrawalCoins)));
  const requestedTon = Math.max(0, number(amountTon));
  return {
    valid: requestedTon >= minimumTon,
    requestedTon,
    requiredDzx: tonToDzx(Math.max(requestedTon, minimumTon), rate),
    requiredCoins: coins,
    minimumTon
  };
}

module.exports = {
  DEFAULT_ECONOMY,
  tonToDzx,
  dzxToTon,
  calculateReferralReward,
  isSquadDailyActive,
  resolveSquadBonus,
  calculateActivityReward,
  validateEconomicBudget,
  calculateWithdrawalRequirement
};
