const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { VALID_SCOPES, nextChallengeStart, challengeWindow, matchesChallengeScope, distributeReward } = require('../src/services/squad-weekly-challenge-service');
const root = path.join(__dirname, '..');

test('Weekly Challenge exposes only the locked scopes', () => {
  assert.deepStrictEqual(VALID_SCOPES, ['ALL TASKS', 'Type Tasks', 'Verified Ad', 'Verified Task', 'Verified Squad AdView', 'All Activity Verified']);
});

test('challenge created during a UTC+1 day starts at next UTC+1 midnight', () => {
  const start = nextChallengeStart(new Date('2026-09-01T12:00:00Z'));
  assert.strictEqual(start.toISOString(), '2026-09-01T23:00:00.000Z');
});

test('challenge window is exactly seven consecutive UTC+1 days', () => {
  const window = challengeWindow(new Date('2026-09-01T23:00:00Z'));
  assert.strictEqual(window.endsAt.toISOString(), '2026-09-08T23:00:00.000Z');
});

test('scope matching uses existing activity reward metadata', () => {
  assert.strictEqual(matchesChallengeScope({ source: 'task', activityType: 'social' }, 'ALL TASKS', null), true);
  assert.strictEqual(matchesChallengeScope({ source: 'task', activityType: 'social' }, 'Type Tasks', 'social'), true);
  assert.strictEqual(matchesChallengeScope({ source: 'task', activityType: 'social' }, 'Type Tasks', 'web'), false);
  assert.strictEqual(matchesChallengeScope({ source: 'advertisement', activityContext: 'task' }, 'Verified Ad', null), true);
  assert.strictEqual(matchesChallengeScope({ source: 'task', activityType: 'social' }, 'Verified Task', null), true);
  assert.strictEqual(matchesChallengeScope({ source: 'advertisement', activityContext: 'squad' }, 'Verified Squad AdView', null), true);
  assert.strictEqual(matchesChallengeScope({ source: 'advertisement', activityContext: 'verification' }, 'All Activity Verified', null), true);
});

test('reward distribution is proportional, deterministic and sums to the configured reward', () => {
  const result = distributeReward('100', [{ userId: '2', contribution: '2' }, { userId: '1', contribution: '1' }]);
  assert.deepStrictEqual(result.map(item => item.rewardAmount), ['66.666666667', '33.333333333']);
  assert.strictEqual(result.reduce((sum, item) => sum + BigInt(item.rewardScaled), 0n), 100000000000n);
});

test('reward distribution never allocates a negative remainder', () => {
  const result = distributeReward('2', [
    { userId: '1', contribution: '1' },
    { userId: '2', contribution: '1' },
    { userId: '3', contribution: '1' },
    { userId: '4', contribution: '1' }
  ]);
  assert.deepStrictEqual(result.map(item => item.rewardAmount), ['0.5', '0.5', '0.5', '0.5']);
  assert.ok(result.every(item => BigInt(item.rewardScaled) >= 0n));
  assert.strictEqual(result.reduce((sum, item) => sum + BigInt(item.rewardScaled), 0n), 2000000000n);
});

test('reward distribution uses the canonical Economy proportional rounding primitive', () => {
  const economy = fs.readFileSync(path.join(root, 'src/services/economy-service.js'), 'utf8');
  const squad = fs.readFileSync(path.join(root, 'src/services/squad-weekly-challenge-service.js'), 'utf8');
  assert.match(economy, /function multiplyRatioScaled\(amount, numerator, denominator\)/);
  assert.match(economy, /remainder.*2n.*denominator/);
  assert.match(squad, /multiplyRatioScaled\(remainingReward, item\.contribution, remainingContribution\)/);
  assert.doesNotMatch(squad, /largest fractional remainder|remainder.*sort|function roundRatio/);
});

test('sub-unit rounded shares remain non-negative and keep the configured total', () => {
  const result = distributeReward('0.000000001', [
    { userId: '1', contribution: '1' },
    { userId: '2', contribution: '1' }
  ]);
  assert.deepStrictEqual(result.map(item => item.rewardAmount), ['0.000000001', '0']);
  assert.ok(result.every(item => BigInt(item.rewardScaled) >= 0n));
  assert.strictEqual(result.reduce((sum, item) => sum + BigInt(item.rewardScaled), 0n), 1n);
});

test('settlement skips zero rounded shares before Economy posting', () => {
  const squad = fs.readFileSync(path.join(root, 'src/services/squad-weekly-challenge-service.js'), 'utf8');
  assert.match(squad, /if \(reward\.rewardAmount === '0'\) continue;/);
});

test('zero contribution produces no distribution', () => {
  assert.deepStrictEqual(distributeReward('100', []), []);
});

test('weekly challenge persistence uses a snapshot and seven-day window', () => {
  const migration = fs.readFileSync(path.join(root, 'migrations/036_squad_weekly_challenges.sql'), 'utf8');
  assert.match(migration, /config_snapshot JSONB NOT NULL/);
  assert.match(migration, /CHECK \(ends_at = starts_at \+ INTERVAL '7 days'\)/);
  assert.match(migration, /reward_transaction_id BIGINT REFERENCES ledger_transactions/);
});

test('existing Economy boundary receives activity scope metadata', () => {
  const economy = fs.readFileSync(path.join(root, 'src/services/economy-service.js'), 'utf8');
  const verification = fs.readFileSync(path.join(root, 'src/services/task-verification-service.js'), 'utf8');
  const advertisement = fs.readFileSync(path.join(root, 'src/services/task-advertisement-service.js'), 'utf8');
  assert.match(economy, /activity_type/);
  assert.match(economy, /activity_context/);
  assert.match(verification, /activityType: row\.task_type/);
  assert.match(advertisement, /activityContext: event\.context/);
});

test('admin challenge API is protected by existing admin authentication', () => {
  const routes = fs.readFileSync(path.join(root, 'src/http/admin-squad-challenge-routes.js'), 'utf8');
  assert.match(routes, /router\.use\(adminAuth\)/);
  assert.match(routes, /settleWeeklyChallenge/);
});
