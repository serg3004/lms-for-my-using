import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './visual-tests',
  outputDir: '../../test-results/visual',
  fullyParallel: true,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [['line']] : [['list']],
  // Baselines are generated on Linux (matches the ubuntu-latest CI runner) and committed
  // under visual-tests/*-snapshots/ -- see visual-tests/README.md for the update procedure.
  // A different OS renders fonts/anti-aliasing differently, so baselines are not portable
  // across platforms; Playwright's default snapshot naming already suffixes them by platform.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
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
