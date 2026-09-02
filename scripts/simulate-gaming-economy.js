const assert = require('node:assert/strict');

const DEFAULTS = Object.freeze({
  users: 1000,
  days: 30,
  activitiesPerDay: 20,
  axeActivityThreshold: 10,
  spinAdsPerDay: 100,
  diggingAdsPerDay: 100,
  diggingAdsPerAxe: 10,
  dailyEnergy: 3,
  bonusDzxProbability: 0.5,
  jackpotWeight: 0,
});

const SPIN_WEIGHTS = Object.freeze([
  ['100C', 400], ['1000C', 40], ['1DZX', 20], ['10DZX', 2],
  ['1DZP', 20], ['10DZP', 2], ['extraSpin', 16], ['none', 1500],
]);
const DIGGING_BOARD = Object.freeze(['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', '100C', '100C', '100C', '1DZX', '1DZP', 'extraAxe']);

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function weightedPick(rng, weights) {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [result, weight] of weights) {
    cursor -= weight;
    if (cursor < 0) return result;
  }
  return weights.at(-1)[0];
}

function shuffle(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function addReward(total, result) {
  if (result === '100C') total.coin += 100;
  if (result === '1000C') total.coin += 1000;
  if (result === '1DZX') total.dzx += 1;
  if (result === '10DZX') total.dzx += 10;
  if (result === '1DZP') total.dzp += 1;
  if (result === '10DZP') total.dzp += 10;
}

function simulate(options = {}) {
  const config = { ...DEFAULTS, ...options };
  assert(config.users > 0 && config.days > 0);
  const rng = createRng(options.seed ?? 54);
  const spinWeights = config.jackpotWeight > 0
    ? [...SPIN_WEIGHTS, ['jackpot', config.jackpotWeight]]
    : SPIN_WEIGHTS;
  const total = { users: config.users, days: config.days, activities: 0, spinsGenerated: 0, spinsPlayed: 0, axesGenerated: 0, axesConsumed: 0, energyUsed: 0, spinAds: 0, diggingAds: 0, coin: 0, dzx: 0, dzp: 0, jackpots: 0, extraSpins: 0, extraAxes: 0 };

  for (let user = 0; user < config.users; user += 1) {
    let spins = 0;
    let axes = 0;
    let board = null;
    let tile = 0;
    for (let day = 0; day < config.days; day += 1) {
      spins += config.activitiesPerDay;
      total.activities += config.activitiesPerDay;
      const activityAxes = Math.floor(config.activitiesPerDay / config.axeActivityThreshold);
      axes += activityAxes;
      total.axesGenerated += activityAxes;
      spins += config.spinAdsPerDay;
      total.spinAds += config.spinAdsPerDay;
      for (let ad = 0; ad < config.spinAdsPerDay; ad += 1) addAdBonus(total, rng, config.bonusDzxProbability);
      axes += Math.floor(config.diggingAdsPerDay / config.diggingAdsPerAxe);
      total.axesGenerated += Math.floor(config.diggingAdsPerDay / config.diggingAdsPerAxe);
      total.diggingAds += config.diggingAdsPerDay;
      for (let ad = 0; ad < config.diggingAdsPerDay; ad += 1) addAdBonus(total, rng, config.bonusDzxProbability);
      while (spins > 0) {
        spins -= 1;
        total.spinsPlayed += 1;
        const result = weightedPick(rng, spinWeights);
        if (result === 'extraSpin') { spins += 1; total.extraSpins += 1; continue; }
        if (result === 'jackpot') { total.dzx += 50; total.jackpots += 1; continue; }
        addReward(total, result);
      }
      let energy = config.dailyEnergy;
      if (!board || tile >= board.length) {
        if (axes > 0) { axes -= 1; total.axesConsumed += 1; board = shuffle(DIGGING_BOARD, rng); tile = 0; }
      }
      while (energy > 0 && board && tile < board.length) {
        const result = board[tile];
        tile += 1;
        energy -= 1;
        total.energyUsed += 1;
        if (result === 'extraAxe') { axes += 1; total.extraAxes += 1; total.axesGenerated += 1; }
        else addReward(total, result);
      }
    }
  }
  return { ...total, dzxEquivalent: total.dzx + total.coin / 1000 + total.dzp * 10 };
}

function addAdBonus(total, rng, dzxProbability) {
  if (rng() < dzxProbability) total.dzx += 1;
  else total.coin += 100;
}

function printReport(result) {
  console.log(JSON.stringify({ ...result, averagePerUser: { coin: result.coin / result.users, dzx: result.dzx / result.users, dzp: result.dzp / result.users, dzxEquivalent: result.dzxEquivalent / result.users } }, null, 2));
}

if (require.main === module) printReport(simulate());

module.exports = { DEFAULTS, SPIN_WEIGHTS, DIGGING_BOARD, simulate };
