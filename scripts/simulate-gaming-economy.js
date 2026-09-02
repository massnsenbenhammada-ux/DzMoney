const USERS = 1000;
const DAYS = 30;
const ACTIVITY_PER_DAY = 20;
const DZX_PER_DZP = 10;
const COIN_PER_DZX = 1000;

function rng(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 0x100000000; }; }
function choice(weights, random) { const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0); const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0); let pick = Math.floor(random() * total); for (const [key, weight] of entries) { pick -= Number(weight); if (pick < 0) return key; } return entries[entries.length - 1][0]; }

function simulateUser(random, config) {
  const spinWeights = config.spin.weights;
  const diggingWeights = config.digging.weights;
  const adBonusWeights = config.adBonus;
  const adsPerGame = Number(config.dailyAdLimit);
  const axeEveryAds = Number(config.diggingAxeEveryAds);
  const diggingEnergy = Number(config.digging.energy);
  let spins = 0; let axes = 1; let coin = 0; let dzx = 0; let dzp = 0; let extraSpins = 0; let spinAds = 0; let diggingAds = 0; let extraAxes = 0;
  for (let day = 0; day < DAYS; day += 1) {
    spins += ACTIVITY_PER_DAY;
    axes += Math.floor(ACTIVITY_PER_DAY / axeEveryAds);
    for (let ad = 0; ad < adsPerGame; ad += 1) {
      spins += 1; spinAds += 1; diggingAds += 1;
      const bonus = choice(adBonusWeights, random);
      if (bonus === 'dzx_1') dzx += 1; else coin += 100;
      if ((ad + 1) % axeEveryAds === 0) axes += 1;
    }
    while (spins > 0) {
      spins -= 1;
      const result = choice(spinWeights, random);
      if (result === 'coin_100') coin += 100;
      else if (result === 'coin_1000') coin += 1000;
      else if (result === 'dzx_1') dzx += 1;
      else if (result === 'dzx_10') dzx += 10;
      else if (result === 'dzp_1') dzp += 1;
      else if (result === 'dzp_10') dzp += 10;
      else if (result === 'extra_spin') { spins += 1; extraSpins += 1; }
    }
    for (let dig = 0; dig < diggingEnergy; dig += 1) {
      const result = choice(diggingWeights, random);
      if (result === 'coin_100') coin += 100;
      else if (result === 'coin_1000') coin += 1000;
      else if (result === 'dzx_1') dzx += 1;
      else if (result === 'dzx_10') dzx += 10;
      else if (result === 'dzp_1') dzp += 1;
      else if (result === 'dzp_10') dzp += 10;
      else if (result === 'extra_axe') { axes += 1; extraAxes += 1; }
    }
  }
  return { activities:DAYS*ACTIVITY_PER_DAY, spins:DAYS*ACTIVITY_PER_DAY+spinAds+extraSpins, axes, spinAds, diggingAds, coin, dzx, dzp, extraSpins, extraAxes, dzxEquivalent:coin/COIN_PER_DZX+dzx+dzp*DZX_PER_DZP };
}

function run(config) {
  if (!config) throw new Error('Gaming configuration is required for economic simulation');
  const random = rng(54054);
  const users = Array.from({ length: USERS }, () => simulateUser(random, config));
  const keys = Object.keys(users[0]);
  const totals = Object.fromEntries(keys.map(key => [key, users.reduce((sum, user) => sum + user[key], 0)]));
  const averages = Object.fromEntries(keys.map(key => [key, totals[key] / USERS]));
  const cost = users.map(user => user.dzxEquivalent);
  const result = { users:USERS, days:DAYS, averages, bestCase:Math.max(...cost), worstCase:Math.min(...cost), totalEconomyCostDZXEquivalent:totals.dzxEquivalent };
  console.log(JSON.stringify(result, null, 2));
  if (averages.dzxEquivalent >= 1200) throw new Error(`Gaming average economic cost ${averages.dzxEquivalent.toFixed(2)} DZX exceeds 1200 DZX guardrail`);
  return result;
}

module.exports = { run, simulateUser };
