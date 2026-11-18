import assert from 'node:assert/strict';
import test from 'node:test';

import { checkPlaywrightImage } from './check-playwright-image.mjs';

const ok = {
  packageVersions: { 'package.json': '1.65.0', 'apps/e2e/package.json': '1.65.0' },
  workflows: { 'ci.yml': 'image: mcr.microsoft.com/playwright:v1.65.0-noble\nimage: mcr.microsoft.com/playwright:v1.65.0-noble' },
};

test('accepts matching exact version and image tags', () => {
  assert.deepEqual(checkPlaywrightImage(ok), []);
});

test('rejects a version range', () => {
  const problems = checkPlaywrightImage({ ...ok, packageVersions: { 'package.json': '^1.65.0', 'apps/e2e/package.json': '1.65.0' } });
  assert.match(problems.join('\n'), /exact version/);
});

test('rejects packages that disagree', () => {
  const problems = checkPlaywrightImage({ ...ok, packageVersions: { 'package.json': '1.65.0', 'apps/e2e/package.json': '1.66.0' } });
  assert.match(problems.join('\n'), /differ/);
});

test('rejects an image tag that differs from the package version', () => {
  const problems = checkPlaywrightImage({ ...ok, workflows: { 'ci.yml': 'image: mcr.microsoft.com/playwright:v1.64.0-noble' } });
  assert.match(problems.join('\n'), /v1\.64\.0 does not match/);
});

test('requires at least one image reference', () => {
  const problems = checkPlaywrightImage({ ...ok, workflows: { 'ci.yml': 'runs-on: ubuntu-latest' } });
  assert.match(problems.join('\n'), /no Playwright image/);
});
