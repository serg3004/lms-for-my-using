import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const rootReadmePath = resolve(repoRoot, 'README.md');
const docsReadmePath = resolve(repoRoot, 'docs/README.md');
const claudePath = resolve(repoRoot, 'CLAUDE.md');
const aiStarterPath = resolve(repoRoot, 'docs/AI_AGENT_STARTER_PROMPT.md');
const archiveReadmePath = resolve(repoRoot, 'docs/archive/README.md');
const archivedMasterContextPath = resolve(repoRoot, 'docs/archive/pre-implementation-master-context');
const legacyMasterContextPath = resolve(repoRoot, 'docs/master-context');
const evidenceReadmePath = resolve(repoRoot, 'docs/evidence/README.md');
const activeWorkMigrationPath = resolve(repoRoot, 'docs/_meta/active-work-migration.json');
const openDecisionsPath = resolve(repoRoot, 'docs/status/OPEN_DECISIONS.md');
const pullRequestTemplatePath = resolve(repoRoot, '.github/pull_request_template.md');
const issueTemplatePath = resolve(repoRoot, '.github/ISSUE_TEMPLATE/work-item.md');
const workflowsPath = resolve(repoRoot, '.github/workflows');

const evidenceMoves = [
  ['CI_AUDIT_BASELINE.md', 'audits/CI_AUDIT_BASELINE.md'],
  ['DOCUMENTATION_AUDIT.md', 'audits/DOCUMENTATION_AUDIT.md'],
  ['DEAD_CODE_AUDIT.md', 'audits/DEAD_CODE_AUDIT.md'],
  ['FRONTEND_MVP_MAINTAINABILITY_AUDIT.md', 'audits/FRONTEND_MVP_MAINTAINABILITY_AUDIT.md'],
  ['PR_89_102_VERIFICATION.md', 'audits/PR_89_102_VERIFICATION.md'],
  ['PAGINATION_QUERY_PERFORMANCE_AUDIT.md', 'performance/PAGINATION_QUERY_PERFORMANCE_AUDIT.md'],
  ['PR259_FRONTEND_PERFORMANCE_VERIFICATION.md', 'performance/PR259_FRONTEND_PERFORMANCE_VERIFICATION.md'],
  ['PR265_PRODUCTION_VERIFICATION.md', 'production/PR265_PRODUCTION_VERIFICATION.md'],
  ['PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md', 'observability/PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md'],
  ['PR_161_OBSERVABILITY_VERIFICATION.md', 'observability/PR_161_OBSERVABILITY_VERIFICATION.md'],
  ['SECURITY_AUDIT_PR_153.md', 'security/SECURITY_AUDIT_PR_153.md'],
  ['RAILWAY_PRODUCTION_SMOKE_STATUS.md', 'smoke/RAILWAY_PRODUCTION_SMOKE_STATUS.md'],
  ['STAGING_SMOKE_REPORT.md', 'smoke/STAGING_SMOKE_REPORT.md'],
  ['runbooks/INCIDENT_RESPONSE_TABLETOP_2026-08-22.md', 'incidents/INCIDENT_RESPONSE_TABLETOP_2026-08-22.md'],
];

const taxonomyDirectories = [
  'docs/product',
  'docs/architecture',
  'docs/contracts',
  'docs/runbooks',
  'docs/quality',
  'docs/status',
];

const retiredTrackerMoves = [
  ['docs/DEVELOPMENT_PLAN.md', 'docs/archive/development-ledger/DEVELOPMENT_PLAN.md'],
  ['docs/TODO_VERIFY.md', 'docs/archive/old-trackers/TODO_VERIFY.md'],
  ['docs/CONCERNS.md', 'docs/archive/old-trackers/CONCERNS.md'],
  ['docs/RECOMMENDATIONS.md', 'docs/archive/old-trackers/RECOMMENDATIONS.md'],
  ['docs/PRODUCTION_HARDENING_BACKLOG.md', 'docs/archive/old-trackers/PRODUCTION_HARDENING_BACKLOG.md'],
  ['docs/FRONTEND_COVERAGE_ROADMAP.md', 'docs/archive/old-trackers/FRONTEND_COVERAGE_ROADMAP.md'],
  ['docs/ORG_STRUCTURE_IMPLEMENTATION_PLAN.md', 'docs/archive/old-trackers/ORG_STRUCTURE_IMPLEMENTATION_PLAN.md'],
  ['docs/ORG_STRUCTURE_PR_PLAN.md', 'docs/archive/old-trackers/ORG_STRUCTURE_PR_PLAN.md'],
  ['docs/BRANCH_PROTECTION_FUTURE_WORK.md', 'docs/archive/old-trackers/BRANCH_PROTECTION_FUTURE_WORK.md'],
  ['docs/PROJECT_LOG.md', 'docs/archive/old-trackers/PROJECT_LOG.md'],
];

function sorted(values) {
  return [...values].sort();
}

function localMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map(([, target]) => target.trim())
    .filter((target) => target && !target.startsWith('#'))
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => target.split('#', 1)[0])
    .filter(Boolean);
}

function assertRelativeTargetsExist(markdown, sourcePath) {
  for (const target of localMarkdownLinks(markdown)) {
    const resolved = resolve(dirname(sourcePath), decodeURIComponent(target));
    assert.ok(existsSync(resolved), `broken local documentation link: ${target} from ${sourcePath}`);
  }
}

function markdownFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFilesRecursively(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

function globPatternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}

function assertEntryPointExists(target) {
  const decoded = decodeURIComponent(target);
  const resolved = resolve(dirname(docsReadmePath), decoded);

  if (!decoded.includes('*')) {
    assert.ok(existsSync(resolved), `docs README current entry point is missing: ${target}`);
    return;
  }

  const directory = dirname(resolved);
  const filePattern = basename(resolved);
  assert.ok(existsSync(directory), `docs README entry-point directory is missing: ${dirname(target)}`);
  const matches = readdirSync(directory).filter((entry) => globPatternToRegExp(filePattern).test(entry));
  assert.ok(matches.length > 0, `docs README current entry-point pattern has no matches: ${target}`);
}

test('documentation governance entry points exist', () => {
  for (const path of [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'docs/README.md',
    'docs/AI_AGENT_STARTER_PROMPT.md',
    'docs/archive/README.md',
    'docs/evidence/README.md',
    'docs/status/OPEN_DECISIONS.md',
    'docs/_meta/active-work-migration.json',
    'docs/_meta/ownership.json',
    '.github/ISSUE_TEMPLATE/work-item.md',
    '.github/pull_request_template.md',
  ]) {
    assert.ok(existsSync(resolve(repoRoot, path)), `required documentation entry point is missing: ${path}`);
  }
});

test('root and active AI entry-point local links resolve', () => {
  for (const path of [rootReadmePath, claudePath, aiStarterPath]) {
    assertRelativeTargetsExist(readFileSync(path, 'utf8'), path);
  }
});

test('pre-implementation master context is archived completely', () => {
  assert.ok(!existsSync(legacyMasterContextPath), 'legacy docs/master-context directory must not exist');
  assert.ok(existsSync(archiveReadmePath), 'docs/archive/README.md is missing');
  assert.ok(existsSync(archivedMasterContextPath), 'archived pre-implementation master context is missing');

  const archivedFiles = readdirSync(archivedMasterContextPath);
  const numberedFiles = archivedFiles.filter((entry) => /^\d{2}_.*\.md$/.test(entry));
  const expectedNumbers = Array.from({ length: 23 }, (_, index) => String(index + 1).padStart(2, '0'));
  const actualNumbers = numberedFiles.map((entry) => entry.slice(0, 2));

  assert.equal(numberedFiles.length, 23, 'archive must preserve exactly 23 numbered master-context files');
  assert.deepEqual(sorted(actualNumbers), expectedNumbers, 'archive must preserve numbered master-context files 01 through 23');
  assert.ok(archivedFiles.includes('AI_AGENT_STARTER_PROMPT.md'), 'historical AI starter must remain archived');
});

test('verification snapshots remain separated into evidence', () => {
  assert.ok(existsSync(evidenceReadmePath), 'docs/evidence/README.md is missing');
  assertRelativeTargetsExist(readFileSync(evidenceReadmePath, 'utf8'), evidenceReadmePath);

  for (const [legacyRelativePath, evidenceRelativePath] of evidenceMoves) {
    assert.ok(!existsSync(resolve(repoRoot, 'docs', legacyRelativePath)), `evidence remains in current docs: ${legacyRelativePath}`);
    assert.ok(existsSync(resolve(repoRoot, 'docs/evidence', evidenceRelativePath)), `evidence is missing: ${evidenceRelativePath}`);
  }
});

test('DOC-08 retires writable Markdown trackers without losing provenance', () => {
  const migration = JSON.parse(readFileSync(activeWorkMigrationPath, 'utf8'));
  assert.equal(migration.canonicalOwners.implementation, 'GitHub Issues/Project');
  assert.equal(migration.canonicalOwners.ownerDecisions, 'docs/status/OPEN_DECISIONS.md');
  assert.ok(Array.isArray(migration.implementationWorkItems) && migration.implementationWorkItems.length > 0);
  const stableIds = migration.implementationWorkItems.map((item) => item.stableId);
  assert.equal(new Set(stableIds).size, stableIds.length, 'DOC-08 stable IDs must be unique');

  for (const [legacyPath, archivedPath] of retiredTrackerMoves) {
    assert.ok(!existsSync(resolve(repoRoot, legacyPath)), `legacy writable tracker still exists: ${legacyPath}`);
    assert.ok(existsSync(resolve(repoRoot, archivedPath)), `archived tracker is missing: ${archivedPath}`);
  }

  assert.match(readFileSync(openDecisionsPath, 'utf8'), /единственный writable Markdown-регистр только для owner\/business decisions/);
});

test('GitHub templates use work-item ownership instead of development-ledger planning', () => {
  const pullRequestTemplate = readFileSync(pullRequestTemplatePath, 'utf8');
  const issueTemplate = readFileSync(issueTemplatePath, 'utf8');
  assert.doesNotMatch(pullRequestTemplate, /DEVELOPMENT_PLAN|Plan PR:/);
  assert.match(pullRequestTemplate, /Work item:/);
  assert.match(issueTemplate, /## Цель/);
  assert.match(issueTemplate, /## Scope/);
  assert.match(issueTemplate, /## Критерии готовности/);
  assert.match(issueTemplate, /## Риск \/ rollback/);
  assert.match(issueTemplate, /## Docs impact/);
});

test('current workflows do not depend on archived development ledger', () => {
  const workflowFiles = readdirSync(workflowsPath).filter((entry) => /\.ya?ml$/.test(entry));
  for (const workflowFile of workflowFiles) {
    assert.doesNotMatch(readFileSync(resolve(workflowsPath, workflowFile), 'utf8'), /DEVELOPMENT_PLAN\.md/);
  }
});

test('current taxonomy local Markdown links resolve', () => {
  for (const relativeDirectory of taxonomyDirectories) {
    const directory = resolve(repoRoot, relativeDirectory);
    assert.ok(existsSync(directory), `current taxonomy directory is missing: ${relativeDirectory}`);
    for (const markdownPath of markdownFilesRecursively(directory)) {
      assertRelativeTargetsExist(readFileSync(markdownPath, 'utf8'), markdownPath);
    }
  }
});

test('docs README current entry-point paths resolve without scanning history', () => {
  const docsReadme = readFileSync(docsReadmePath, 'utf8');
  const section = docsReadme.match(/## Current entry points[^\n]*\n([\s\S]*?)(?=\n## |$)/)?.[1];
  assert.ok(section, 'docs README current entry-points section was not found');
  const entryPoints = [...section.matchAll(/`([^`]+\.md)`/g)].map(([, target]) => target);
  for (const target of entryPoints) assertEntryPointExists(target);
});
