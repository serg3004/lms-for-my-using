module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@lms/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  roots: ['<rootDir>/src'],
  testPathIgnorePatterns: [
    '/src/integration/api\\.database-smoke\\.spec\\.ts$',
    '/src/integration/checklist-snapshot\\.database\\.spec\\.ts$',
    '/src/integration/checklist-deadline\\.database\\.spec\\.ts$',
    '/src/integration/reports-summary\\.database\\.spec\\.ts$',
    '/src/integration/org-structure-foundation\\.database\\.spec\\.ts$',
    '/src/integration/departments-tree\\.database\\.spec\\.ts$',
    '/src/integration/department-memberships\\.database\\.spec\\.ts$',
    '/src/integration/department-managers\\.database\\.spec\\.ts$',
    '/src/integration/department-headcounts\\.database\\.spec\\.ts$',
    '/src/integration/positions\\.database\\.spec\\.ts$',
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/scripts/**',
  ],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 45,
      functions: 60,
      lines: 60,
    },
  },
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        useESM: true,
      },
    ],
  },
};
