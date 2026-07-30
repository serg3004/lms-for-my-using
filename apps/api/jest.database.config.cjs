const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/src/integration/api.database-smoke.spec.ts'],
  testPathIgnorePatterns: [],
  testTimeout: 60_000,
};
