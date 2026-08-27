import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const appModule = readFileSync(new URL('../apps/api/src/app.module.ts', import.meta.url), 'utf8');
const architecture = readFileSync(new URL('../docs/ARCHITECTURE_MODULE_BOUNDARIES.md', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../docs/API_RBAC_MATRIX.md', import.meta.url), 'utf8');
const rootReadmePath = fileURLToPath(new URL('../README.md', import.meta.url));
const docsReadmePath = fileURLToPath(new URL('../docs/README.md', import.meta.url));
const claudePath = fileURLToPath(new URL('../CLAUDE.md', import.meta.url));
const aiStarterPath = fileURLToPath(new URL('../docs/AI_AGENT_STARTER_PROMPT.md', import.meta.url));
const archiveReadmePath = fileURLToPath(new URL('../docs/archive/README.md', import.meta.url));
const archivedMasterContextPath = fileURLToPath(new URL('../docs/archive/pre-implementation-master-context/', import.meta.url));
const legacyMasterContextPath = fileURLToPath(new URL('../docs/master-context/', import.meta.url));
const rootReadme = readFileSync(rootReadmePath, 'utf8');
const docsReadme = readFileSync(docsReadmePath, 'utf8');
const claude = readFileSync(claudePath, 'utf8');
const aiStarter = readFileSync(aiStarterPath, 'utf8');

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

test('docs README current entry-point paths resolve without scanning history', () => {
  const section = docsReadme.match(/## Current entry points[^\n]*\n([\s\S]*?)(?=\n## |$)/)?.[1];
  assert.ok(section, 'docs README current entry-points section was not found');

  const entryPoints = [...section.matchAll(/`([^`]+\.md)`/g)].map(([, target]) => target);
  assert.ok(entryPoints.length > 0, 'docs README current entry-points section has no document paths');

  for (const target of entryPoints) {
    assertEntryPointExists(target);
  }
});
