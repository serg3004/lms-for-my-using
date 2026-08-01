import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);
const nodeEnvironment = process.env.NODE_ENV ?? 'test';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/lms';
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ''));

if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) || !databaseName) {
  throw new Error('E2E DATABASE_URL must identify a PostgreSQL database');
}

if (nodeEnvironment === 'production') {
  throw new Error('Browser E2E cannot seed a production environment');
}

if (!/^[a-zA-Z0-9_-]+$/.test(databaseName) || !/^[a-zA-Z0-9_-]+$/.test(nodeEnvironment)) {
  throw new Error('E2E seed confirmations contain unsupported characters');
}

const startApiCommand = [
  'pnpm --filter @lms/api build',
  [
    'pnpm --filter @lms/api admin:demo-seed',
    '--apply',
    `--confirm-environment=${nodeEnvironment}`,
    `--confirm-database=${databaseName}`,
  ].join(' '),
  'pnpm --filter @lms/api dev',
].join(' && ');

export default defineConfig({
  testDir: './tests',
  outputDir: '../../test-results',
  fullyParallel: true,
  forbidOnly: ci,
  // A failure must remain visible instead of being hidden by a successful retry.
  retries: 0,
  workers: ci ? 2 : undefined,
  reporter: ci
    ? [['line'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: startApiCommand,
      url: 'http://127.0.0.1:3000/api/v1/health/live',
      reuseExistingServer: !ci,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: nodeEnvironment,
        DATABASE_URL: databaseUrl,
        JWT_SECRET: process.env.JWT_SECRET ?? 'local-e2e-jwt-secret-at-least-32-characters',
      },
    },
    {
      command: 'pnpm --filter @lms/web dev --host 127.0.0.1',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
