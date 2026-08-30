const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  testMatch: [
    '<rootDir>/src/integration/api.database-smoke.spec.ts',
    '<rootDir>/src/integration/checklist-snapshot.database.spec.ts',
    '<rootDir>/src/integration/checklist-deadline.database.spec.ts',
    '<rootDir>/src/integration/reports-summary.database.spec.ts',
    '<rootDir>/src/integration/org-structure-foundation.database.spec.ts',
    '<rootDir>/src/integration/departments-tree.database.spec.ts',
    '<rootDir>/src/integration/department-memberships.database.spec.ts',
    '<rootDir>/src/integration/department-managers.database.spec.ts',
  ],
  testPathIgnorePatterns: [],
  testTimeout: 60_000,
};
