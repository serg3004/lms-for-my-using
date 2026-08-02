import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './visual-tests',
  outputDir: '../../test-results/visual',
  fullyParallel: true,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [['line']] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    colorScheme: 'light',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @lms/web dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/login',
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
