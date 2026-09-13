#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function collectNumberedFiles(directory, filenamePattern, numberPattern) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && filenamePattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(numberPattern);
      return { name: entry.name, number: match ? Number.parseInt(match[1], 10) : null };
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
  return [...byNumber.entries()].filter(([, names]) => names.length > 1);
}

function nextAvailableNumber(files) {
  return files.reduce((max, file) => Math.max(max, file.number), 0) + 1;
}

const migrations = collectNumberedFiles(path.join(ROOT, 'migrations'), /^\d+(?:[-_]).*\.sql$/, /^(\d+)(?:[-_])/);
const adrs = collectNumberedFiles(path.join(ROOT, 'docs'), /^ADR-\d+(?:[-_]).*\.md$/, /^ADR-(\d+)(?:[-_])/);

console.log(`Migrations next: ${nextAvailableNumber(migrations)}`);
console.log(`ADRs next: ${nextAvailableNumber(adrs)}`);
console.log(`Migration duplicates: ${findDuplicates(migrations).length}`);
console.log(`ADR duplicates: ${findDuplicates(adrs).length}`);
