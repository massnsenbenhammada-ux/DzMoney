#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function collectNumberedFiles(directory, filenamePattern) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && filenamePattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(/^(\d+)(?:[-_])/);
      return {
        name: entry.name,
        number: match ? Number.parseInt(match[1], 10) : null,
      };
    })
    .filter((entry) => Number.isInteger(entry.number));
}

function findDuplicates(files) {
  const byNumber = new Map();

  for (const file of files) {
    const existing = byNumber.get(file.number) || [];
    existing.push(file.name);
    byNumber.set(file.number, existing);
  }

  return [...byNumber.entries()]
    .filter(([, names]) => names.length > 1)
    .sort(([a], [b]) => a - b);
}

function nextAvailableNumber(files) {
  const highest = files.reduce(
    (max, file) => Math.max(max, file.number),
    0,
  );
  return highest + 1;
}

function checkCategory(label, directory, filenamePattern) {
  const files = collectNumberedFiles(directory, filenamePattern);
  const duplicates = findDuplicates(files);
  const next = nextAvailableNumber(files);

  console.log(`${label}: ${files.length} numbered files; next available number: ${String(next).padStart(4, '0')}`);

  if (duplicates.length === 0) return true;

  console.error(`${label}: duplicate leading numbers detected:`);
  for (const [number, names] of duplicates) {
    console.error(`  ${String(number).padStart(4, '0')}: ${names.join(', ')}`);
  }
  return false;
}

const migrationOk = checkCategory(
  'Migrations',
  path.join(ROOT, 'migrations'),
  /^\d+(?:[-_]).*\.sql$/,
);

const adrOk = checkCategory(
  'ADRs',
  path.join(ROOT, 'docs'),
  /^ADR-\d+(?:[-_]).*\.md$/,
);

if (!migrationOk || !adrOk) {
  console.error('Repository hygiene check failed: numbered files must not reuse the same leading number within their category.');
  process.exit(1);
}

console.log('Repository hygiene check passed.');
