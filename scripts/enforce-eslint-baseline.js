const fs = require('fs');

const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
const baseline = JSON.parse(fs.readFileSync('.eslint-baseline.json', 'utf8'));
const errors = report.reduce((sum, file) => sum + file.errorCount, 0);
const warnings = report.reduce((sum, file) => sum + file.warningCount, 0);
const affectedFiles = report.filter((file) => file.messages.length > 0).length;

if (!Number.isInteger(baseline.errorCount) || baseline.errorCount < 0) {
  throw new Error('Invalid .eslint-baseline.json errorCount');
}

console.log(`ESLINT_ERROR_COUNT=${errors}`);
console.log(`ESLINT_WARNING_COUNT=${warnings}`);
console.log(`ESLINT_AFFECTED_FILE_COUNT=${affectedFiles}`);
console.log(`ESLINT_BASELINE=${baseline.errorCount}`);

if (errors > baseline.errorCount) {
  console.error(`ESLINT_GATE=FAIL (current ${errors} > baseline ${baseline.errorCount})`);
  process.exit(1);
}

console.log(`ESLINT_GATE=PASS (current ${errors} <= baseline ${baseline.errorCount})`);
