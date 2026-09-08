const fs = require('node:fs');
const path = require('node:path');

const BASELINE_DUPLICATES = new Set([
  'npm run test:task-card-creator-scope',
  'npm run test:creator-panel-scope'
]);

const REAL_STATE_REQUIREMENTS = [
  {
    id: 'gaming-reward',
    script: 'test:e2e:real-state-gaming',
    spec: 'tests/e2e/gaming-real-state.spec.js'
  },
  {
    id: 'share-with-friends-reward',
    script: 'test:e2e:real-state-share-with-friends',
    spec: 'tests/e2e/share-with-friends-real-state.spec.js'
  }
];

function parseTestAll(command) {
  return command
    .split(/&&|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const scriptMatch = entry.match(/^npm run (test:[^\s]+)$/);
      if (scriptMatch) return { type: 'script', name: scriptMatch[1], command: entry };

      const fileMatch = entry.match(/^node (?:--test )?(\S+)$/);
      if (fileMatch) return { type: 'file', path: fileMatch[1], command: entry };

      return { type: 'unknown', command: entry };
    });
}

function validateTestAll(packageJson, root) {
  const testAll = packageJson?.scripts?.['test:all'];
  if (typeof testAll !== 'string' || !testAll.trim()) {
    return { entries: [], errors: ['package.json must define a non-empty test:all script'] };
  }

  const entries = parseTestAll(testAll);
  const errors = [];
  const seen = new Set();
  const scripts = packageJson.scripts || {};
  const baselineSeen = new Set();

  for (const entry of entries) {
    if (entry.type === 'unknown') continue;

    const key = entry.type === 'script' ? `script:${entry.name}` : `file:${entry.path}`;
    if (seen.has(key)) {
      if (BASELINE_DUPLICATES.has(entry.command) && !baselineSeen.has(entry.command)) {
        baselineSeen.add(entry.command);
      } else {
        errors.push(`duplicate test entry: ${entry.command}`);
      }
    }
    seen.add(key);

    if (entry.type === 'script') {
      if (!scripts[entry.name]) errors.push(`missing npm script referenced by test:all: ${entry.name}`);
      if (entry.name === 'test:all') errors.push('test:all must not recursively invoke itself');
      continue;
    }

    const filePath = path.resolve(root, entry.path);
    if (!fs.existsSync(filePath)) errors.push(`missing test file referenced by test:all: ${entry.path}`);
  }

  return { entries, errors };
}

function validateRealStateCoverage(packageJson, root) {
  const scripts = packageJson?.scripts || {};
  const testAll = String(scripts['test:all'] || '');
  const errors = [];

  for (const requirement of REAL_STATE_REQUIREMENTS) {
    const command = String(scripts[requirement.script] || '');
    if (!command) {
      errors.push(`missing real-state gate script: ${requirement.script}`);
      continue;
    }
    if (!/\bplaywright\s+test\b/.test(command)) {
      errors.push(`real-state gate must execute Playwright: ${requirement.script}`);
    }
    if (!command.includes(requirement.spec)) {
      errors.push(`real-state gate must execute ${requirement.spec}: ${requirement.script}`);
    }
    if (!testAll.split(/&&|\n/).map(part => part.trim()).includes(`npm run ${requirement.script}`)) {
      errors.push(`real-state gate must be included in test:all: ${requirement.script}`);
    }
    if (!fs.existsSync(path.resolve(root, requirement.spec))) {
      errors.push(`missing real-state E2E spec: ${requirement.spec}`);
    }
  }

  return errors;
}

function run() {
  const root = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const result = validateTestAll(packageJson, root);
  const realStateErrors = validateRealStateCoverage(packageJson, root);
  result.errors.push(...realStateErrors);

  if (result.errors.length) {
    console.error('Test Governance FAILED');
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Test Governance OK: ${result.entries.length} test:all entries and all real-state release gates validated`);
}

if (require.main === module) run();

module.exports = { parseTestAll, validateTestAll, validateRealStateCoverage, REAL_STATE_REQUIREMENTS };
