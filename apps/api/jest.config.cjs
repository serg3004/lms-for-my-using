module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^\\./organizations\\.schemas\\.js$': '<rootDir>/src/modules/organizations/organizations.schemas.ts',
    '^\\./organizations\\.service\\.js$': '<rootDir>/src/modules/organizations/organizations.service.ts',
    '^\\./users\\.schemas\\.js$': '<rootDir>/src/modules/users/users.schemas.ts',
    '^\\./users\\.service\\.js$': '<rootDir>/src/modules/users/users.service.ts',
    '^\\.\\./\\.\\./database/prisma\\.service\\.js$': '<rootDir>/src/database/prisma.service.ts',
  },
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        useESM: true,
      },
    ],
  },
};
