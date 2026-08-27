import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function read(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function markdownFilesRecursively(relativeDirectory) {
  const directory = resolve(repoRoot, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) return markdownFilesRecursively(relativePath);
    return entry.isFile() && entry.name.endsWith('.md') ? [relativePath] : [];
  });
}

const currentMarkdown = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/AI_AGENT_STARTER_PROMPT.md',
  'docs/PROJECT_SOURCE_OF_TRUTH.md',
  'docs/documentation_full_remediation_plan_pdca_v3.md',
  'docs/lms-ui-prototypes-complete/README.md',
  'infra/railway/README.md',
  ...['docs/product', 'docs/architecture', 'docs/contracts', 'docs/runbooks', 'docs/quality', 'docs/status']
    .flatMap(markdownFilesRecursively),
];

test('DOC-12 closes transitional artifacts while preserving migration history', () => {
  assert.ok(!existsSync(resolve(repoRoot, 'docs/_meta/path-map.json')), 'DOC-07 temporary path map must be closed');

  for (const path of [
    'docs/archive/remediation/PROJECT_SOURCE_OF_TRUTH_PRE_DOC12.md',
    'docs/archive/remediation/documentation_full_remediation_plan_pdca_v3.md',
    'docs/archive/remediation/path-map-doc07.json',
    'docs/archive/remediation/MVP_DEFINITION_OF_DONE_PRE_DOC12.md',
    'docs/archive/remediation/MVP_READINESS_DASHBOARD_PRE_DOC12.md',
    'docs/archive/remediation/RELEASE_GATE_PRE_DOC12.md',
  ]) {
    assert.ok(existsSync(resolve(repoRoot, path)), `DOC-12 remediation archive is missing: ${path}`);
  }

  assert.match(read('docs/PROJECT_SOURCE_OF_TRUTH.md'), /SUPERSEDED/);
  assert.match(read('docs/documentation_full_remediation_plan_pdca_v3.md'), /COMPLETED \/ SUPERSEDED/);
  assert.match(read('docs/product/MVP_DEFINITION_OF_DONE.md'), /SUPERSEDED/);
  assert.match(read('docs/status/MVP_READINESS_DASHBOARD.md'), /SUPERSEDED/);
});

test('current documentation map no longer exposes transitionals as current entry points', () => {
  const docsReadme = read('docs/README.md');
  assert.doesNotMatch(docsReadme, /docs\/_meta\/path-map\.json/);

  const entryPoints = docsReadme.match(/## Current entry points[\s\S]*?(?=\n## |$)/)?.[0];
  assert.ok(entryPoints, 'Current entry points section is missing');
  assert.doesNotMatch(entryPoints, /documentation_full_remediation_plan_pdca_v3/);
  assert.doesNotMatch(entryPoints, /MVP_DEFINITION_OF_DONE/);
  assert.doesNotMatch(entryPoints, /MVP_READINESS_DASHBOARD/);
});

test('volatile module and RBAC inventories are derived instead of hand-maintained', () => {
  const architecture = read('docs/architecture/ARCHITECTURE_MODULE_BOUNDARIES.md');
  const rbac = read('docs/contracts/API_RBAC_MATRIX.md');

  assert.match(architecture, /generated\/MODULES\.md/);
  assert.doesNotMatch(architecture, /Current production `AppModule` imports/);
  assert.match(rbac, /generated\/RBAC\.md/);
  assert.doesNotMatch(rbac, /^\| Resource\/action \|/m);
  assert.doesNotMatch(rbac, /on \d+ controllers:/);
});

test('repository-local Markdown path literals in current docs point to existing files', () => {
  const staleReferences = [];

  for (const relativePath of new Set(currentMarkdown)) {
    const content = read(relativePath);
    const referencedPaths = [...content.matchAll(/`(docs\/[A-Za-z0-9_.\/-]+\.md)`/g)].map((match) => match[1]);
    for (const referencedPath of referencedPaths) {
      if (!existsSync(resolve(repoRoot, referencedPath))) {
        staleReferences.push(`${referencedPath} <- ${relativePath}`);
      }
    }
  }

  assert.deepEqual(staleReferences, [], `stale repository documentation paths:\n${staleReferences.join('\n')}`);
});

test('root navigation points to the single documentation map', () => {
  const rootReadme = read('README.md');
  assert.match(rootReadme, /docs\/README\.md/);
  assert.match(read('docs/README.md'), /единственная current карта документации/);
});

test('final DOC-12 evidence report exists', () => {
  assert.ok(
    existsSync(resolve(repoRoot, 'docs/evidence/audits/DOC_12_FINAL_INTEGRITY_AUDIT_2026-08-27.md')),
    'DOC-12 final evidence report is missing',
  );
});
