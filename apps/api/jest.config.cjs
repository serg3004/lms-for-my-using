module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^\\./auth\\.guard\\.js$': '<rootDir>/src/modules/auth/auth.guard.ts',
    '^\\./auth\\.schemas\\.js$': '<rootDir>/src/modules/auth/auth.schemas.ts',
    '^\\./auth\\.service\\.js$': '<rootDir>/src/modules/auth/auth.service.ts',
    '^\\./auth\\.tokens\\.js$': '<rootDir>/src/modules/auth/auth.tokens.ts',
    '^\\./passwords\\.js$': '<rootDir>/src/modules/auth/passwords.ts',
    '^\\./organizations\\.schemas\\.js$': '<rootDir>/src/modules/organizations/organizations.schemas.ts',
    '^\\./organizations\\.service\\.js$': '<rootDir>/src/modules/organizations/organizations.service.ts',
    '^\\./users\\.schemas\\.js$': '<rootDir>/src/modules/users/users.schemas.ts',
    '^\\./users\\.service\\.js$': '<rootDir>/src/modules/users/users.service.ts',
    '^\\.\\./auth/auth\\.guard\\.js$': '<rootDir>/src/modules/auth/auth.guard.ts',
    '^\\.\\./auth/auth\\.module\\.js$': '<rootDir>/src/modules/auth/auth.module.ts',
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
