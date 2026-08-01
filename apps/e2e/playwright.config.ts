import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

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
      command: 'pnpm --filter @lms/api dev',
      url: 'http://127.0.0.1:3000/api/v1/health/live',
      reuseExistingServer: !ci,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV ?? 'test',
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
