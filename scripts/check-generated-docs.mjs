import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');
const generatedFiles = ['API_INDEX.md', 'RBAC.md', 'MODULES.md', 'ENTITIES.md'];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function snapshot() {
  return Object.fromEntries(
    generatedFiles.map((file) => [file, readFileSync(resolve(repoRoot, 'docs/generated', file), 'utf8')]),
  );
}

run('pnpm', ['docs:generate']);
const first = snapshot();

run('node', ['apps/api/dist/scripts/generate-docs.js']);
const second = snapshot();
assert.deepEqual(second, first, 'docs generation must be idempotent');

const diff = spawnSync('git', ['diff', '--exit-code', '--', 'docs/generated'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (diff.status !== 0) {
  process.stderr.write(diff.stdout ?? '');
  process.stderr.write(diff.stderr ?? '');
  process.stderr.write('\nGenerated documentation is stale. Run `pnpm docs:generate` and commit the result.\n');
  process.exit(diff.status ?? 1);
}
