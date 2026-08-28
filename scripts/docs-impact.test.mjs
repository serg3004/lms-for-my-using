import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  changedFilesBetween,
  evaluateImpact,
  matchesGlob,
  parseReviewedNoChange,
  readImpactContext,
  validateOwnership,
} from './docs-impact.mjs';

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed\n${result.stderr ?? ''}`);
  return (result.stdout ?? '').trim();
}

function write(repoRoot, path, content = `${path}\n`) {
  const fullPath = join(repoRoot, path);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function fixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'docs-impact-'));
  runGit(repoRoot, ['init', '-b', 'main']);
  runGit(repoRoot, ['config', 'user.email', 'docs-impact@example.test']);
  runGit(repoRoot, ['config', 'user.name', 'Docs Impact Test']);

  for (const path of [
    'docs/generated/README.md',
    'docs/generated/API_INDEX.md',
    'docs/contracts/API_CONTRACTS.md',
    'apps/api/src/modules/courses/courses.controller.ts',
    'src/internal.ts',
  ]) write(repoRoot, path);
  runGit(repoRoot, ['add', '.']);
  runGit(repoRoot, ['commit', '-m', 'fixture base']);

  const config = {
    version: 1,
    generatedArtifacts: ['docs/generated/API_INDEX.md'],
    mappings: [{
      id: 'api',
      sourceGlobs: ['apps/api/src/modules/**/*.controller.ts'],
      generatedTargets: ['docs/generated/API_INDEX.md'],
      manualTargets: ['docs/contracts/API_CONTRACTS.md'],
      reason: 'API surface',
    }],
  };
  return { repoRoot, config };
}

test('glob matcher supports recursive controller patterns', () => {
  assert.equal(matchesGlob('apps/api/src/modules/courses/courses.controller.ts', 'apps/api/src/modules/**/*.controller.ts'), true);
  assert.equal(matchesGlob('apps/api/src/modules/courses/internal.ts', 'apps/api/src/modules/**/*.controller.ts'), false);
});

test('ownership validation fails closed for zero-match, unregistered generated target, and overlap conflicts', () => {
  const { repoRoot, config } = fixture();
  try {
    const validated = validateOwnership(config, { repoRoot });
    assert.equal(validated.mappings[0].sourceFiles.length, 1);

    const zeroMatch = structuredClone(config);
    zeroMatch.mappings[0].sourceGlobs = ['apps/api/src/modules/**/*.missing.ts'];
    assert.throws(() => validateOwnership(zeroMatch, { repoRoot }), /zero tracked matches/);

    const badGenerated = structuredClone(config);
    badGenerated.mappings[0].generatedTargets = ['docs/generated/RBAC.md'];
    assert.throws(() => validateOwnership(badGenerated, { repoRoot }), /not declared in generatedArtifacts/);

    const overlap = structuredClone(config);
    overlap.mappings.push({
      id: 'api-overlap',
      sourceGlobs: ['apps/api/src/modules/courses/*.controller.ts'],
      generatedTargets: [],
      manualTargets: ['docs/contracts/API_CONTRACTS.md'],
    });
    assert.throws(() => validateOwnership(overlap, { repoRoot }), /mapping conflict/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('mapped source changes require a manual target or explicit reviewed-no-change reason', () => {
  const { repoRoot, config } = fixture();
  try {
    const validated = validateOwnership(config, { repoRoot });
    const source = 'apps/api/src/modules/courses/courses.controller.ts';

    const missing = evaluateImpact(validated, [source], 'Docs-Impact:');
    assert.equal(missing.failures.length, 1);

    const manual = evaluateImpact(validated, [source, 'docs/contracts/API_CONTRACTS.md'], '');
    assert.equal(manual.failures.length, 0);
    assert.equal(manual.triggered[0].satisfiedBy, 'manual-target');

    const reviewed = evaluateImpact(validated, [source], 'Docs-Impact: reviewed-no-change — controller refactor only');
    assert.equal(reviewed.failures.length, 0);
    assert.equal(reviewed.triggered[0].satisfiedBy, 'reviewed-no-change');

    const internal = evaluateImpact(validated, ['src/internal.ts'], '');
    assert.equal(internal.triggered.length, 0);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('reviewed-no-change rejects placeholders', () => {
  assert.equal(parseReviewedNoChange('Docs-Impact: reviewed-no-change — N/A'), null);
  assert.equal(parseReviewedNoChange('Docs-Impact: reviewed-no-change - TBD'), null);
  assert.equal(parseReviewedNoChange('Docs-Impact: reviewed-no-change — public behavior unchanged'), 'public behavior unchanged');
});

test('PR context reads base/head/body while push mode requires no PR body', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'docs-impact-event-'));
  try {
    const prEvent = join(tempRoot, 'pr.json');
    writeFileSync(prEvent, JSON.stringify({ pull_request: { base: { sha: 'base' }, head: { sha: 'head' }, body: 'Docs-Impact: x' } }));
    assert.deepEqual(
      readImpactContext({ eventPath: prEvent }),
      {
        mode: 'pull_request',
        baseSha: 'base',
        headSha: 'head',
        body: 'Docs-Impact: x',
        event: { pull_request: { base: { sha: 'base' }, head: { sha: 'head' }, body: 'Docs-Impact: x' } },
      },
    );

    const pushEvent = join(tempRoot, 'push.json');
    writeFileSync(pushEvent, JSON.stringify({ ref: 'refs/heads/main' }));
    assert.equal(readImpactContext({ eventPath: pushEvent }).mode, 'push');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('changed file detection uses repository-local base/head git diff including deletions', () => {
  const { repoRoot } = fixture();
  try {
    const base = runGit(repoRoot, ['rev-parse', 'HEAD']);
    write(repoRoot, 'apps/api/src/modules/courses/courses.controller.ts', 'changed\n');
    runGit(repoRoot, ['rm', 'src/internal.ts']);
    runGit(repoRoot, ['add', '.']);
    runGit(repoRoot, ['commit', '-m', 'change sources']);
    const head = runGit(repoRoot, ['rev-parse', 'HEAD']);

    const changed = changedFilesBetween(base, head, { repoRoot });
    assert.ok(changed.includes('apps/api/src/modules/courses/courses.controller.ts'));
    assert.ok(changed.includes('src/internal.ts'));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
