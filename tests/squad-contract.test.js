const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRICE_TIERS,
  getSquadTier,
  selectLowestSquad,
  modifierForContribution,
  isChallengeScopeMatch,
  dailyActivation,
} = require('../src/services/squad-service');

test('price tiers map current member count to the configured tier', () => {
  assert.equal(getSquadTier(1).price, 100);
  assert.equal(getSquadTier(10).price, 100);
  assert.equal(getSquadTier(11).price, 200);
  assert.equal(getSquadTier(100).price, 1000);
  assert.equal(getSquadTier(101).price, 2000);
  assert.equal(getSquadTier(300).price, 3000);
  assert.equal(getSquadTier(0), null);
  assert.ok(PRICE_TIERS.length >= 6);
});

test('selection chooses the smallest squad in the requested tier', () => {
  const squads = [
    { id: 1, memberCount: 73 },
    { id: 2, memberCount: 57 },
    { id: 3, memberCount: 91 },
  ];
  assert.equal(selectLowestSquad(squads, { min: 51, max: 100 }).id, 2);
});

test('a squad can cross a tier boundary after receiving a member', () => {
  assert.equal(getSquadTier(100).key, '51-100');
  assert.equal(getSquadTier(101).key, '101-200');
});

test('modifier mapping caps at 100 percent', () => {
  assert.equal(modifierForContribution(1499), 0);
  assert.equal(modifierForContribution(1500), 0.15);
  assert.equal(modifierForContribution(5000), 0.5);
  assert.equal(modifierForContribution(10000), 1);
  assert.equal(modifierForContribution(15000), 1);
});

test('daily activation succeeds when either condition is met', () => {
  assert.equal(dailyActivation({ target: 500, contribution: 500, eligibleMembers: 50, activeMembers: 0 }).active, true);
  assert.equal(dailyActivation({ target: 500, contribution: 100, eligibleMembers: 50, activeMembers: 25 }).active, true);
  assert.equal(dailyActivation({ target: 500, contribution: 100, eligibleMembers: 50, activeMembers: 24 }).active, false);
});

test('challenge scopes match only the relevant verified activity type', () => {
  assert.equal(isChallengeScopeMatch('all_activity_verified', { kind: 'task' }), true);
  assert.equal(isChallengeScopeMatch('all_activity_verified', { kind: 'advertisement' }), true);
  assert.equal(isChallengeScopeMatch('verified_task', { kind: 'task' }), true);
  assert.equal(isChallengeScopeMatch('verified_task', { kind: 'advertisement' }), false);
  assert.equal(isChallengeScopeMatch('verified_ad', { kind: 'advertisement' }), true);
  assert.equal(isChallengeScopeMatch('verified_squad_adview', { kind: 'squad_advertisement' }), true);
  assert.equal(isChallengeScopeMatch('verified_squad_adview', { kind: 'advertisement' }), false);
  assert.equal(isChallengeScopeMatch('type_task', { kind: 'task', taskType: 'social' }, { taskType: 'social' }), true);
  assert.equal(isChallengeScopeMatch('type_task', { kind: 'task', taskType: 'social' }, { taskType: 'game' }), false);
});
