#!/usr/bin/env node
// PR 471: the Playwright CI jobs run in the official Microsoft image. The image carries its own
// browser build, so its tag must equal the exact @playwright/test version the lockfile installs;
// a drifting pair fails here with a clear message instead of as a "browser executable not found"
// error (or noisy visual diffs) inside the container.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_PATTERN = /mcr\.microsoft\.com\/playwright:v([0-9]+\.[0-9]+\.[0-9]+)-([a-z]+)/g;
const EXACT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function checkPlaywrightImage({ packageVersions, workflows }) {
  const problems = [];
  const versions = new Set();

  for (const [file, version] of Object.entries(packageVersions)) {
    if (!EXACT_VERSION.test(version ?? '')) {
      problems.push(`${file}: @playwright/test must be pinned to an exact version, found "${version}"`);
    } else {
      versions.add(version);
    }
  }
  if (versions.size > 1) {
    problems.push(`@playwright/test versions differ between packages: ${[...versions].join(', ')}`);
  }

  const expected = versions.size === 1 ? [...versions][0] : null;
  let images = 0;
  for (const [file, text] of Object.entries(workflows)) {
    for (const match of text.matchAll(IMAGE_PATTERN)) {
      images += 1;
      if (expected && match[1] !== expected) {
        problems.push(`${file}: image tag v${match[1]} does not match @playwright/test ${expected}`);
      }
    }
  }
  if (images === 0) {
    problems.push('no Playwright image reference found in .github/workflows (jobs must run in the pinned image)');
  }
  return problems;
}

function load(root) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const packageVersions = {};
  for (const path of ['package.json', 'apps/e2e/package.json']) {
    const manifest = JSON.parse(read(path));
    packageVersions[path] = manifest.devDependencies?.['@playwright/test'] ?? manifest.dependencies?.['@playwright/test'];
  }
  const workflows = {};
  for (const name of readdirSync(join(root, '.github/workflows'))) {
    if (name.endsWith('.yml')) workflows[`.github/workflows/${name}`] = read(`.github/workflows/${name}`);
  }
  return { packageVersions, workflows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkPlaywrightImage(load(root));
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log('Playwright image tag matches the pinned @playwright/test version.');
}
