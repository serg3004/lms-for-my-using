const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  testMatch: [
    '<rootDir>/src/integration/api.database-smoke.spec.ts',
    '<rootDir>/src/integration/checklist-snapshot.database.spec.ts',
    '<rootDir>/src/integration/checklist-deadline.database.spec.ts',
    '<rootDir>/src/integration/reports-summary.database.spec.ts',
  ],
  testPathIgnorePatterns: [],
  testTimeout: 60_000,
};
