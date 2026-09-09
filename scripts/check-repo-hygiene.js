const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function listFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => path.join(directory, entry.name));
}

function findDuplicatePrefixes(files, prefixPattern) {
  const groups = new Map();
  for (const file of files) {
    const match = path.basename(file).match(prefixPattern);
    if (!match) continue;
    const prefix = match[1];
    const entries = groups.get(prefix) || [];
    entries.push(path.relative(root, file));
    groups.set(prefix, entries);
  }
  return [...groups.entries()].filter(([, entries]) => entries.length > 1);
}

function checkMigrationNumbers() {
  const files = listFiles(path.join(root, 'migrations'), /^\d+[_-].*\.sql$/);
  return findDuplicatePrefixes(files, /^(\d+)[_-]/);
}

function checkAdrNumbers() {
  const files = listFiles(path.join(root, 'docs'), /^ADR-\d+.*\.md$/);
  return findDuplicatePrefixes(files, /^ADR-(\d+)/);
}

function checkWorkflowNodeVersions() {
  const workflowDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) return [];

  const versions = new Map();
  for (const file of listFiles(workflowDir, /\.yml$/)) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(/node-version:\s*['"]?([^\s'"}]+)/g)];
    for (const match of matches) {
      const version = match[1];
      const entries = versions.get(version) || [];
      entries.push(path.relative(root, file));
      versions.set(version, entries);
    }
  }

  if (versions.size <= 1) return [];
  return [...versions.entries()].map(([version, files]) => ({ version, files }));
}

const migrationDuplicates = checkMigrationNumbers();
const adrDuplicates = checkAdrNumbers();
const nodeVersionConflicts = checkWorkflowNodeVersions();

let failed = false;

if (migrationDuplicates.length) {
  failed = true;
  console.error('Duplicate migration number prefixes found:');
  for (const [prefix, files] of migrationDuplicates) {
    console.error(`  ${prefix}: ${files.join(', ')}`);
  }
}

if (adrDuplicates.length) {
  failed = true;
  console.error('Duplicate ADR number prefixes found:');
  for (const [prefix, files] of adrDuplicates) {
    console.error(`  ADR-${prefix}: ${files.join(', ')}`);
  }
}

if (nodeVersionConflicts.length) {
  failed = true;
  console.error('Conflicting GitHub Actions node-version values found:');
  for (const { version, files } of nodeVersionConflicts) {
    console.error(`  ${version}: ${files.join(', ')}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('Repository hygiene: PASS');
