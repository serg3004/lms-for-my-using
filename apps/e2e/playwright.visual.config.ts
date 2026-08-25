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
  //
  // maxDiffPixels (not maxDiffPixelRatio): investigating a real CI failure
  // (github.com/serg3004/lms-for-my-using/actions/runs/32753040826) showed every failing page
  // differing by a near-constant *count* of pixels regardless of viewport width (roughly
  // 5k-29k), not a ratio -- classic font/anti-aliasing drift between the Chromium build that
  // generated these baselines and the one CI installs fresh, not a layout regression (a real
  // regression injected during that investigation produced a 1.2M-pixel diff, ~40x this
  // budget). A ratio-based threshold fails hardest on narrow viewports, where that same fixed
  // pixel count is a larger fraction of a smaller image -- which is exactly the failure
  // pattern observed. Once apps/e2e/visual-tests/README.md's `update-visual-baselines.yml`
  // workflow is available on `main` (it needs to be merged once before it can be dispatched)
  // and baselines are regenerated with it, this can very likely be tightened back down.
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 30_000,
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
