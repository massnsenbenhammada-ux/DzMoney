const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseTestAll,
  validateTestAll
} = require('../scripts/test-governance');

const existingRoot = require('node:path').resolve(__dirname, '..');

test('test governance parses npm run entries and direct node test files', () => {
  const entries = parseTestAll(
    'npm run test:alpha && node ./scripts/test-alpha.js && node --test ./tests/alpha.test.js'
  );

  assert.deepEqual(entries, [
    { type: 'script', name: 'test:alpha', command: 'npm run test:alpha' },
    { type: 'file', path: './scripts/test-alpha.js', command: 'node ./scripts/test-alpha.js' },
    { type: 'file', path: './tests/alpha.test.js', command: 'node --test ./tests/alpha.test.js' }
  ]);
});

test('test governance rejects missing npm scripts and missing direct test files', () => {
  const result = validateTestAll({
    scripts: {
      'test:all': 'npm run test:missing && node ./scripts/missing-test.js'
    }
  }, existingRoot);

  assert.deepEqual(result.errors, [
    'missing npm script referenced by test:all: test:missing',
    'missing test file referenced by test:all: ./scripts/missing-test.js'
  ]);
});

test('test governance rejects duplicate entries and test:all recursion', () => {
  const result = validateTestAll({
    scripts: {
      'test:all': 'npm run test:alpha && npm run test:alpha && npm run test:all',
      'test:alpha': 'node ./scripts/test-alpha.js'
    }
  }, existingRoot);

  assert.deepEqual(result.errors, [
    'duplicate test entry: npm run test:alpha',
    'test:all must not recursively invoke itself'
  ]);
});

test('current test:all passes governance validation', () => {
  const packageJson = require('../package.json');
  const result = validateTestAll(packageJson, existingRoot);

  assert.deepEqual(result.errors, []);
  assert.ok(result.entries.length > 0);
});
