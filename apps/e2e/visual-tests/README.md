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
automatically by a failed CI run.

**Preferred: the `Update visual regression baselines` GitHub Actions workflow**
(`.github/workflows/update-visual-baselines.yml`). It's `workflow_dispatch`-only
(never runs on push/PR) and regenerates the baselines using the exact Chromium
build CI installs, then pushes the result back to whichever branch you dispatch
it against. Note: like any new `workflow_dispatch` workflow, GitHub only lets you
dispatch it once the workflow file exists on the repository's default branch —
so the first time this workflow is added, it needs to be merged before it can be
run.

**Manual fallback** (only if you can't use the workflow above): from `apps/e2e`,
on a machine as close to `ubuntu-latest` as possible with the exact Chromium
build CI installs (`pnpm exec playwright install --with-deps chromium`), run:

```bash
pnpm exec playwright test --config playwright.visual.config.ts --update-snapshots
```

A different Chromium build (even on the same Linux distro) renders fonts/icons
slightly differently and produces a constant, viewport-independent pixel-count
diff that looks like noise, not a real regression — see the `Tolerance` note
below for how this was diagnosed on 2026-08-24.

Either way:

1. Review the diff of every changed `.png` under `responsive-matrix.spec.ts-snapshots/`
   (`git diff --stat`, and open a few in an image viewer) — confirm each change is an
   intended UI change, not noise or an unrelated regression.
2. Commit the updated snapshots together with the UI change that caused them, in the
   same PR, so a reviewer can see *why* the baseline moved.

Never run `--update-snapshots` in CI, and never commit a baseline you have not
visually reviewed.

## If baselines fail with wildly varying diffs across runs, check for a stale branch first

Before chasing a rendering-environment theory, rule out the mundane cause: this
branch being behind `main`. GitHub's `pull_request` trigger (what runs `ci.yml`'s
"Checks" job) tests a **virtual merge** of the PR branch with the current `main`
— not the branch's own HEAD. A `workflow_dispatch`/`push`-triggered job (like
`update-visual-baselines.yml`) checks out the branch's real HEAD, with no merge.
If `main` has moved since the branch's baselines were generated, "Checks" can be
comparing against genuinely different, newer page markup while the isolated
regen workflow keeps reproducing the old one — this looks exactly like
nondeterministic CI noise (different failure counts, different pages, changing
between runs) but is actually just two jobs testing two different versions of
the code. `git merge origin/main` (or rebase) into the branch and regenerate
baselines again before assuming anything about Chromium, fonts, or timing.

## Tolerance

`playwright.visual.config.ts` sets `maxDiffPixels: 30_000` (not a ratio) with
animations and the caret disabled.

This was discovered the hard way: PR 264's initial baselines were generated in a
sandbox with a stale pre-installed Chromium, one revision behind what
`playwright install --with-deps chromium` fetches fresh on the `ubuntu-latest` CI
runner. CI failed with diffs of roughly 5k-29k pixels per page — but that count
stayed roughly constant across every viewport width (320px-1440px), which a real
layout regression would not do (a layout break grows with the viewport). That
pattern is consistent with font/anti-aliasing rendering differences between two
Chromium builds, confirmed by deliberately injecting a real regression
(`background: red` on `<body>`), which produced a ~1.2M-pixel diff — about 40x
this budget. A ratio-based threshold made this worse, not better: the same fixed
pixel count is a *larger fraction* of a smaller image, so narrow viewports failed
hardest even though nothing about them was actually more broken.

Once baselines are regenerated via the workflow above (which uses CI's own
Chromium build, eliminating the version-drift noise), this budget can very likely
be tightened back down closer to the pixel counts a real single-element
regression would produce.
