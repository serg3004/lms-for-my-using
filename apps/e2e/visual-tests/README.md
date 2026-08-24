# Visual regression gate

`responsive-matrix.spec.ts` asserts real pixel-baseline regressions via Playwright's
`expect(page).toHaveScreenshot()`, not just an artifact upload. Config lives in
`playwright.visual.config.ts`; baselines are committed at
`responsive-matrix.spec.ts-snapshots/<name>-<width>-<platform>.png`.

## Why baselines are platform-specific

Font rendering and anti-aliasing differ across operating systems, so a baseline
captured on macOS/Windows will never match a Linux run pixel-for-pixel. CI runs on
`ubuntu-latest` (`.github/workflows/ci.yml`), so **baselines must be generated on
Linux** — Playwright's default snapshot naming already suffixes files with the
platform (`-linux`), so mismatched-platform baselines fail loudly as "missing
snapshot" rather than silently comparing against the wrong image.

## Updating baselines (controlled procedure)

Baselines must only change as part of a reviewable commit — never accepted
automatically by a failed CI run. To update them:

1. On Linux (a Docker container matching `ubuntu-latest`, or this repo's dev
   container), from `apps/e2e`, run:

   ```bash
   pnpm exec playwright test --config playwright.visual.config.ts --update-snapshots
   ```

2. Review the diff of every changed `.png` under `responsive-matrix.spec.ts-snapshots/`
   (`git diff --stat`, and open a few in an image viewer) — confirm each change is an
   intended UI change, not noise or an unrelated regression.
3. Commit the updated snapshots together with the UI change that caused them, in the
   same PR, so a reviewer can see *why* the baseline moved.

Never run `--update-snapshots` in CI, and never commit a baseline you have not
visually reviewed.

## Tolerance

`playwright.visual.config.ts` sets `maxDiffPixelRatio: 0.01` with animations and the
caret disabled, to absorb harmless anti-aliasing jitter between runs on the same
platform while still failing on real layout/style regressions.
