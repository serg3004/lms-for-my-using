import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
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

function workflowCommandEscape(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function meaningfulLines(content) {
  return content.split('\n').filter((line) => line.trim().length > 0);
}

function compactDrift(committed, generated) {
  const sections = [];
  for (const file of generatedFiles) {
    const committedLines = new Set(meaningfulLines(committed[file]));
    const generatedLines = new Set(meaningfulLines(generated[file]));
    const generatedOnly = [...generatedLines].filter((line) => !committedLines.has(line));
    const committedOnly = [...committedLines].filter((line) => !generatedLines.has(line));
    if (generatedOnly.length === 0 && committedOnly.length === 0) continue;

    sections.push([
      file,
      ...generatedOnly.map((line) => `generated-only: ${line}`),
      ...committedOnly.map((line) => `committed-only: ${line}`),
    ].join('\n'));
  }
  return sections.join('\n\n');
}

const committed = snapshot();
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
  const patch = `${diff.stdout ?? ''}${diff.stderr ?? ''}`;
  const concise = compactDrift(committed, first);
  process.stderr.write(patch);
  process.stderr.write(`\nGenerated line drift:\n${concise}\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      `\n## Generated documentation drift\n\nThe committed files differ from \`pnpm docs:generate\`.\n\n\`\`\`text\n${concise}\n\`\`\`\n`,
      'utf8',
    );
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    const diagnostic = concise.length > 12000 ? `${concise.slice(0, 12000)}\n... diagnostic truncated ...` : concise;
    process.stderr.write(`::error title=Generated documentation drift::${workflowCommandEscape(diagnostic)}\n`);
  }

  process.stderr.write('\nGenerated documentation is stale. Run `pnpm docs:generate` and commit the result.\n');
  process.exit(diff.status ?? 1);
}
