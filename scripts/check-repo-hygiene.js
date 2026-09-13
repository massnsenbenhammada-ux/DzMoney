const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function numberFromName(name, prefix) {
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  let i = 0;
  while (i < rest.length && rest.charCodeAt(i) >= 48 && rest.charCodeAt(i) <= 57) i += 1;
  if (!i || (rest[i] !== '-' && rest[i] !== '_')) return null;
  return Number.parseInt(rest.slice(0, i), 10);
}

function readNumbered(directory, prefix, extension) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => ({ name: entry.name, number: numberFromName(entry.name, prefix) }))
    .filter((entry) => Number.isInteger(entry.number));
}

function duplicates(files) {
  const groups = new Map();
  for (const file of files) groups.set(file.number, [...(groups.get(file.number) || []), file.name]);
  return [...groups.entries()].filter(([, names]) => names.length > 1);
}

function check(label, directory, prefix, extension) {
  const files = readNumbered(directory, prefix, extension);
  const collisions = duplicates(files);
  const next = files.reduce((max, file) => Math.max(max, file.number), 0) + 1;
  console.log(`${label}: next available number ${String(next).padStart(4, '0')}`);
  for (const [number, names] of collisions) console.error(`${label}: ${number}: ${names.join(', ')}`);
  return collisions.length === 0;
}

const migrationsOk = check('Migrations', path.join(ROOT, 'migrations'), '', '.sql');
const adrsOk = check('ADRs', path.join(ROOT, 'docs'), 'ADR-', '.md');

if (!migrationsOk || !adrsOk) {
  console.error('Repository hygiene check failed: duplicate leading number.');
  process.exit(1);
}
console.log('Repository hygiene check passed.');
