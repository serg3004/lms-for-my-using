import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const appModule = readFileSync(new URL('../apps/api/src/app.module.ts', import.meta.url), 'utf8');
const architecture = readFileSync(new URL('../docs/architecture/ARCHITECTURE_MODULE_BOUNDARIES.md', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../docs/contracts/API_RBAC_MATRIX.md', import.meta.url), 'utf8');
const rootReadmePath = fileURLToPath(new URL('../README.md', import.meta.url));
const docsReadmePath = fileURLToPath(new URL('../docs/README.md', import.meta.url));
const claudePath = fileURLToPath(new URL('../CLAUDE.md', import.meta.url));
const aiStarterPath = fileURLToPath(new URL('../docs/AI_AGENT_STARTER_PROMPT.md', import.meta.url));
const archiveReadmePath = fileURLToPath(new URL('../docs/archive/README.md', import.meta.url));
const archivedMasterContextPath = fileURLToPath(new URL('../docs/archive/pre-implementation-master-context/', import.meta.url));
const legacyMasterContextPath = fileURLToPath(new URL('../docs/master-context/', import.meta.url));
const evidenceReadmePath = fileURLToPath(new URL('../docs/evidence/README.md', import.meta.url));
const pathMapPath = fileURLToPath(new URL('../docs/_meta/path-map.json', import.meta.url));
const activeWorkMigrationPath = fileURLToPath(new URL('../docs/_meta/active-work-migration.json', import.meta.url));
const openDecisionsPath = fileURLToPath(new URL('../docs/status/OPEN_DECISIONS.md', import.meta.url));
const pullRequestTemplatePath = fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url));
const issueTemplatePath = fileURLToPath(new URL('../.github/ISSUE_TEMPLATE/work-item.md', import.meta.url));
const workflowsPath = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
const rootReadme = readFileSync(rootReadmePath, 'utf8');
const docsReadme = readFileSync(docsReadmePath, 'utf8');
const claude = readFileSync(claudePath, 'utf8');
const aiStarter = readFileSync(aiStarterPath, 'utf8');

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
    if (entry.isDirectory()) {
      return markdownFilesRecursively(entryPath);
    }
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

test('architecture inventory contains every production AppModule import exactly once', () => {
  const importsBlock = appModule.match(/@Module\(\{\s*imports:\s*\[([\s\S]*?)\n\s*\],\s*\n\}\)/)?.[1];
  assert.ok(importsBlock, 'AppModule imports array was not found');

  const productionModules = [...importsBlock.matchAll(/^\s*([A-Z][A-Za-z]+Module)(?:\.forRoot\([\s\S]*?^\s*\}\),|,)/gm)].map(
    ([, name]) => name,
  );
  const inventorySection = architecture.match(/Current production `AppModule` imports[\s\S]*?\nEach API domain module/)?.[0];
  assert.ok(inventorySection, 'checked architecture inventory section was not found');
  const documentedModules = [...inventorySection.matchAll(/^\| `([A-Z][A-Za-z]+Module)` \|/gm)].map(([, name]) => name);

  assert.deepEqual(sorted(documentedModules), sorted(productionModules));
  assert.equal(new Set(documentedModules).size, documentedModules.length, 'architecture inventory has duplicate modules');
});

test('RBAC course-scope controller count and list match CourseAccessGuard usage', () => {
  const paragraph = rbac.match(/alongside the role guards on (\d+) controllers:\n([\s\S]*?)\.\n\n-/);
  assert.ok(paragraph, 'RBAC course-scope controller inventory was not found');
  const documentedCount = Number(paragraph[1]);
  const documentedControllers = [...paragraph[2].matchAll(/`([a-z][a-z-]+)`/g)].map(([, name]) => name);

  const modulesDirectory = new URL('../apps/api/src/modules/', import.meta.url);
  const guardedControllers = readdirSync(modulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(new URL(`${entry.name}/`, modulesDirectory))
      .filter((file) => file.endsWith('.controller.ts'))
      .some((file) => readFileSync(new URL(`${entry.name}/${file}`, modulesDirectory), 'utf8').includes('CourseAccessGuard')))
    .map((entry) => entry.name);

  assert.equal(documentedControllers.length, documentedCount);
  assert.deepEqual(sorted(documentedControllers), sorted(guardedControllers));
});

test('documentation governance entry points exist', () => {
  const requiredPaths = [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'docs/README.md',
    'docs/AI_AGENT_STARTER_PROMPT.md',
    'docs/archive/README.md',
    'docs/evidence/README.md',
    'docs/status/OPEN_DECISIONS.md',
    'docs/_meta/path-map.json',
    'docs/_meta/active-work-migration.json',
    '.github/ISSUE_TEMPLATE/work-item.md',
    '.github/pull_request_template.md',
    'docs/documentation_full_remediation_plan_pdca_v3.md',
  ];

  for (const path of requiredPaths) {
    assert.ok(existsSync(resolve(repoRoot, path)), `required documentation entry point is missing: ${path}`);
  }
});

test('root README local links resolve', () => {
  assertRelativeTargetsExist(rootReadme, rootReadmePath);
});

test('active AI entry-point local links resolve', () => {
  assertRelativeTargetsExist(claude, claudePath);
  assertRelativeTargetsExist(aiStarter, aiStarterPath);
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
  assert.ok(
    archivedFiles.includes('AI_AGENT_STARTER_PROMPT.md'),
    'historical AI agent starter must remain in the pre-implementation archive',
  );
});

test('verification snapshots are separated into evidence without broken local links', () => {
  assert.ok(existsSync(evidenceReadmePath), 'docs/evidence/README.md is missing');
  assertRelativeTargetsExist(readFileSync(evidenceReadmePath, 'utf8'), evidenceReadmePath);

  for (const [legacyRelativePath, evidenceRelativePath] of evidenceMoves) {
    const legacyPath = resolve(repoRoot, 'docs', legacyRelativePath);
    const evidencePath = resolve(repoRoot, 'docs/evidence', evidenceRelativePath);

    assert.ok(!existsSync(legacyPath), `evidence snapshot still exists in current documentation: docs/${legacyRelativePath}`);
    assert.ok(existsSync(evidencePath), `moved evidence snapshot is missing: docs/evidence/${evidenceRelativePath}`);
    assertRelativeTargetsExist(readFileSync(evidencePath, 'utf8'), evidencePath);
  }
});

test('DOC-07 path map matches the current taxonomy migration', () => {
  const pathMap = JSON.parse(readFileSync(pathMapPath, 'utf8'));
  assert.equal(pathMap.lifecycle, 'TEMPORARY');
  assert.match(pathMap.exitCondition, /DOC-12/);

  const moves = Object.entries(pathMap.moves ?? {});
  assert.equal(moves.length, 43, 'DOC-07 path map must contain exactly 43 current-document moves');
  assert.equal(new Set(moves.map(([, newPath]) => newPath)).size, moves.length, 'DOC-07 path-map targets must be unique');

  for (const [oldPath, newPath] of moves) {
    assert.ok(!existsSync(resolve(repoRoot, oldPath)), `legacy current-document path still exists: ${oldPath}`);
    assert.ok(existsSync(resolve(repoRoot, newPath)), `mapped current-document target is missing: ${newPath}`);
  }
});

test('DOC-08 retires writable Markdown trackers without losing migration provenance', () => {
  const migration = JSON.parse(readFileSync(activeWorkMigrationPath, 'utf8'));
  assert.equal(migration.canonicalOwners.implementation, 'GitHub Issues/Project');
  assert.equal(migration.canonicalOwners.ownerDecisions, 'docs/status/OPEN_DECISIONS.md');
  assert.ok(Array.isArray(migration.implementationWorkItems));
  assert.ok(migration.implementationWorkItems.length > 0, 'DOC-08 must preserve confirmed implementation work items');

  const stableIds = migration.implementationWorkItems.map((item) => item.stableId);
  assert.equal(new Set(stableIds).size, stableIds.length, 'DOC-08 work-item stable IDs must be unique');

  for (const [legacyPath, archivedPath] of retiredTrackerMoves) {
    assert.ok(!existsSync(resolve(repoRoot, legacyPath)), `legacy writable tracker still exists: ${legacyPath}`);
    assert.ok(existsSync(resolve(repoRoot, archivedPath)), `archived tracker is missing: ${archivedPath}`);
  }

  const decisions = readFileSync(openDecisionsPath, 'utf8');
  assert.match(decisions, /единственный writable Markdown-регистр только для owner\/business decisions/);
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

test('current GitHub workflows do not append or depend on the archived development ledger', () => {
  const workflowFiles = readdirSync(workflowsPath).filter((entry) => /\.ya?ml$/.test(entry));
  for (const workflowFile of workflowFiles) {
    const content = readFileSync(resolve(workflowsPath, workflowFile), 'utf8');
    assert.doesNotMatch(content, /DEVELOPMENT_PLAN\.md/, `workflow still depends on archived ledger: ${workflowFile}`);
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
  const section = docsReadme.match(/## Current entry points[^\n]*\n([\s\S]*?)(?=\n## |$)/)?.[1];
  assert.ok(section, 'docs README current entry-points section was not found');

  const entryPoints = [...section.matchAll(/`([^`]+\.md)`/g)].map(([, target]) => target);
  assert.ok(entryPoints.length > 0, 'docs README current entry-points section has no document paths');

  for (const target of entryPoints) {
    assertEntryPointExists(target);
  }
});
