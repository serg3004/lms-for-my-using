import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const prototypeRoot = resolve(repoRoot, 'docs/lms-ui-prototypes-complete');
const manifestPath = resolve(prototypeRoot, 'manifest.json');
const prototypeReadmePath = resolve(prototypeRoot, 'README.md');
const glossaryPath = resolve(repoRoot, 'docs/contracts/GLOSSARY.md');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const designStatuses = new Set(['draft', 'approved', 'retired']);
const implementationStatuses = new Set(['unknown', 'not_implemented', 'partial', 'implemented']);
const parityStatuses = new Set(['unknown', 'diverged', 'aligned']);
const gitShaPattern = /^[0-9a-f]{7,64}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertNullableNonEmptyString(value, field, pageId) {
  assert.ok(
    value === null || (typeof value === 'string' && value.trim().length > 0),
    `${pageId}: ${field} must be a non-empty string or null`,
  );
}

function assertValidDate(value, field, pageId) {
  if (value === null) return;
  assert.match(value, datePattern, `${pageId}: ${field} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert.ok(!Number.isNaN(parsed.valueOf()), `${pageId}: ${field} must be a real calendar date`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `${pageId}: ${field} must be a real calendar date`);
}

test('prototype manifest v2 separates design, implementation and parity state', () => {
  assert.equal(manifest.version, 2, 'prototype manifest must use schema version 2');
  assert.ok(Array.isArray(manifest.pages) && manifest.pages.length > 0, 'prototype manifest pages must be non-empty');

  const ids = new Set();

  for (const [index, page] of manifest.pages.entries()) {
    const pageLabel = page?.id ?? `page[${index}]`;

    assert.equal(typeof page?.id, 'string', `${pageLabel}: id must be a string`);
    assert.ok(page.id.trim().length > 0, `${pageLabel}: id must not be empty`);
    assert.ok(!ids.has(page.id), `duplicate prototype id: ${page.id}`);
    ids.add(page.id);

    assert.equal(Object.hasOwn(page, 'status'), false, `${page.id}: legacy status field must not be used`);
    assert.ok(designStatuses.has(page.designStatus), `${page.id}: invalid designStatus`);
    assert.ok(implementationStatuses.has(page.implementationStatus), `${page.id}: invalid implementationStatus`);
    assert.ok(parityStatuses.has(page.parityStatus), `${page.id}: invalid parityStatus`);

    for (const field of ['productionRoute', 'lastComparedAt', 'lastComparedSha', 'knownDifferences']) {
      assert.ok(Object.hasOwn(page, field), `${page.id}: missing ${field}`);
    }

    assertNullableNonEmptyString(page.productionRoute, 'productionRoute', page.id);
    assertNullableNonEmptyString(page.lastComparedAt, 'lastComparedAt', page.id);
    assertNullableNonEmptyString(page.lastComparedSha, 'lastComparedSha', page.id);
    assertValidDate(page.lastComparedAt, 'lastComparedAt', page.id);

    if (page.lastComparedSha !== null) {
      assert.match(page.lastComparedSha, gitShaPattern, `${page.id}: lastComparedSha must be a Git SHA`);
    }

    assert.ok(Array.isArray(page.knownDifferences), `${page.id}: knownDifferences must be an array`);
    for (const difference of page.knownDifferences) {
      assert.ok(
        typeof difference === 'string' && difference.trim().length > 0,
        `${page.id}: knownDifferences entries must be non-empty strings`,
      );
    }

    if (page.implementationStatus === 'implemented') {
      assert.ok(
        typeof page.productionRoute === 'string' && page.productionRoute.trim().length > 0,
        `${page.id}: implemented requires productionRoute`,
      );
    }

    if (page.parityStatus === 'aligned') {
      assert.ok(page.lastComparedAt !== null, `${page.id}: aligned requires lastComparedAt`);
      assert.ok(page.lastComparedSha !== null, `${page.id}: aligned requires lastComparedSha`);
    }

    assert.equal(typeof page.prototype, 'string', `${page.id}: prototype must be a string`);
    assert.ok(page.prototype.trim().length > 0, `${page.id}: prototype must not be empty`);
    assert.equal(isAbsolute(page.prototype), false, `${page.id}: prototype path must be relative`);

    const prototypePath = resolve(prototypeRoot, page.prototype);
    const relativePrototypePath = relative(prototypeRoot, prototypePath);
    assert.ok(
      relativePrototypePath !== '..' && !relativePrototypePath.startsWith(`..${sep}`),
      `${page.id}: prototype path must stay inside prototype root`,
    );
    assert.ok(existsSync(prototypePath), `${page.id}: prototype file does not exist: ${page.prototype}`);
  }
});

test('prototype governance docs keep design authority separate from implementation authority', () => {
  assert.ok(existsSync(prototypeReadmePath), 'prototype README must exist');
  assert.ok(existsSync(glossaryPath), 'terminology glossary must exist');

  const readme = readFileSync(prototypeReadmePath, 'utf8');
  assert.match(readme, /UX\/design reference/);
  assert.match(readme, /approved.*только approved design/s);
  assert.match(readme, /не.*доказывают.*production implementation/s);
  assert.match(readme, /Pixel-parity.*не является blanket requirement/s);
});
