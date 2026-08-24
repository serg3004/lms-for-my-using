import assert from 'node:assert/strict';
import test from 'node:test';

import { readFile } from 'node:fs/promises';

import { configure, desiredRuleset, REQUIRED_CHECKS, verifyRuleset } from './configure-branch-protection.mjs';

test('desired ruleset protects the default branch with the agreed merge gates', () => {
  assert.deepEqual(verifyRuleset(desiredRuleset()), []);
});

test('verification rejects missing checks and non-active enforcement', () => {
  const ruleset = desiredRuleset();
  ruleset.enforcement = 'disabled';
  ruleset.rules.find(({ type }) => type === 'required_status_checks').parameters.required_status_checks = [
    { context: REQUIRED_CHECKS[0] },
  ];
  assert.deepEqual(verifyRuleset(ruleset), [
    'enforcement must be active',
    `required checks must be exactly: ${REQUIRED_CHECKS.join(', ')}`,
  ]);
});

test('required check names match stable workflow job names', async () => {
  const [ciWorkflow, codeqlWorkflow] = await Promise.all([
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/codeql.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(ciWorkflow, /^\s{4}name: Checks$/m);
  assert.match(codeqlWorkflow, /^\s{4}name: Analyze$/m);
  assert.deepEqual(REQUIRED_CHECKS, ['Checks', 'Analyze (javascript-typescript)']);
});

test('audit mode reads repository state without making write requests', async () => {
  const calls = [];
  const responses = [
    { default_branch: 'main' },
    { protected: true },
    [{ id: 42, name: 'Protect main', target: 'branch' }],
    desiredRuleset(),
  ];
  const result = await configure({
    repository: 'owner/repository',
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      return { ok: true, json: async () => responses.shift() };
    },
  });
  assert.equal(result.verified, true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['GET', 'GET', 'GET', 'GET'],
  );
});

test('audit reports policy drift without making write requests', async () => {
  const calls = [];
  const responses = [{ default_branch: 'main' }, { protected: false }, []];
  const result = await configure({
    repository: 'owner/repository',
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      return { ok: true, json: async () => responses.shift() };
    },
  });
  assert.equal(result.verified, false);
  assert.deepEqual(result.verificationFailures, ['missing active ruleset "Protect main"', 'main is not protected']);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['GET', 'GET', 'GET'],
  );
});

test('apply creates and verifies the ruleset with an authorized token', async () => {
  const calls = [];
  const responses = [
    { default_branch: 'main' },
    { protected: false },
    [],
    { id: 42 },
    { ...desiredRuleset(), id: 42 },
    { protected: true },
  ];
  const result = await configure({
    repository: 'owner/repository',
    token: 'test-token',
    apply: true,
    fetchImpl: async (url, options) => {
      calls.push({
        url,
        method: options.method ?? 'GET',
        authorization: options.headers.Authorization,
      });
      return { ok: true, json: async () => responses.shift() };
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(result.verified, true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['GET', 'GET', 'GET', 'POST', 'GET', 'GET'],
  );
  assert.ok(calls.every(({ authorization }) => authorization === 'Bearer test-token'));
});
