const { migrate } = require('../src/db/migration-runner');

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
