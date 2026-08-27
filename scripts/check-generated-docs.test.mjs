import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const checkerPath = resolve(repoRoot, 'scripts/check-generated-docs.mjs');
const target = 'docs/generated/MODULES.md';
const targetPath = resolve(repoRoot, target);
const staleMarker = '<!-- DOC-09.1 stale generated artifact regression sentinel -->';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

function assertOk(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`,
  );
}

function makeNoopExecutable(directory, name) {
  const executable = join(directory, name);
  writeFileSync(executable, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(executable, 0o755);
}

function runChecker(env) {
  return run(process.execPath, [checkerPath], { env });
}

test(
  'generated docs checker reports actual stale diff/annotation and stays strict',
  { skip: process.platform === 'win32' ? 'POSIX PATH shims are used for isolated generator commands' : false },
  () => {
    assertOk(run('git', ['diff', '--quiet', '--', target]), `${target} worktree precondition`);
    assertOk(run('git', ['diff', '--cached', '--quiet', '--', target]), `${target} index precondition`);

    const original = readFileSync(targetPath, 'utf8');
    const tempRoot = mkdtempSync(join(tmpdir(), 'generated-docs-check-'));
    const fakeBin = join(tempRoot, 'bin');
    const summaryPath = join(tempRoot, 'summary.md');

    mkdirSync(fakeBin);
    makeNoopExecutable(fakeBin, 'pnpm');
    makeNoopExecutable(fakeBin, 'node');

    const env = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summaryPath,
    };

    try {
      const separator = original.endsWith('\n') ? '' : '\n';
      writeFileSync(targetPath, `${original}${separator}${staleMarker}\n`, 'utf8');
      assertOk(run('git', ['add', '--', target]), 'stage stale generated artifact');

      // Model a stale committed/index artifact while the regenerated worktree is canonical.
      writeFileSync(targetPath, original, 'utf8');

      const stale = runChecker(env);
      assert.notEqual(stale.status, 0, 'stale generated state must fail');
      assert.match(stale.stderr ?? '', /diff --git/);
      assert.match(stale.stderr ?? '', /DOC-09\.1 stale generated artifact regression sentinel/);
      assert.match(stale.stderr ?? '', /::error title=Generated documentation drift::/);
      assert.match(stale.stderr ?? '', /Generated documentation is stale/);

      const summary = readFileSync(summaryPath, 'utf8');
      assert.match(summary, /Generated documentation drift/);
      assert.match(summary, /DOC-09\.1 stale generated artifact regression sentinel/);

      assertOk(run('git', ['reset', 'HEAD', '--', target]), 'restore generated artifact index');
      writeFileSync(targetPath, original, 'utf8');

      const clean = runChecker(env);
      assert.equal(
        clean.status,
        0,
        `clean generated state must pass\nstdout:\n${clean.stdout ?? ''}\nstderr:\n${clean.stderr ?? ''}`,
      );
    } finally {
      run('git', ['reset', 'HEAD', '--', target]);
      writeFileSync(targetPath, original, 'utf8');
      rmSync(tempRoot, { recursive: true, force: true });
    }
  },
);
