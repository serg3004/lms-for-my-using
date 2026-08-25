import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePreflight, inspectRepository } from './agent-preflight.mjs';

test('evaluatePreflight accepts an up-to-date working branch', () => {
  assert.deepEqual(
    evaluatePreflight({
      branch: 'codex/pr-257',
      headSha: 'head',
      mainSha: 'main',
      ahead: 2,
      behind: 0,
    }),
    {
      branch: 'codex/pr-257',
      headSha: 'head',
      mainSha: 'main',
      ahead: 2,
      behind: 0,
      ok: true,
      failures: [],
    },
  );
});

test('evaluatePreflight rejects protected branches and stale branches', () => {
  const result = evaluatePreflight({
    branch: 'main',
    headSha: 'head',
    mainSha: 'main',
    ahead: 0,
    behind: 3,
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /protected branch/);
  assert.match(result.failures.join('\n'), /3 commit\(s\) behind/);
});

test('inspectRepository fetches main and reports git ahead/behind state', () => {
  const calls = [];
  const responses = new Map([
    ['git fetch --quiet --no-tags origin main', ''],
    ['git branch --show-current', 'feature/example'],
    ['git rev-parse HEAD', 'abc123'],
    ['git rev-parse origin/main', 'def456'],
    ['git rev-list --left-right --count HEAD...origin/main', '4\t0'],
  ]);

  const result = inspectRepository({
    run(command, args) {
      const key = [command, ...args].join(' ');
      calls.push(key);
      if (!responses.has(key)) throw new Error(`Unexpected command: ${key}`);
      return responses.get(key);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.ahead, 4);
  assert.equal(result.behind, 0);
  assert.equal(calls[0], 'git fetch --quiet --no-tags origin main');
});
