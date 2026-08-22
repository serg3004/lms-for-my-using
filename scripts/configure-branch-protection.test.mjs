import assert from 'node:assert/strict';
import test from 'node:test';

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

test('audit mode reads repository state without making write requests', async () => {
  const calls = [];
  const responses = [
    { default_branch: 'main' },
    { protected: false },
    [],
  ];
  const result = await configure({
    repository: 'owner/repository',
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      return { ok: true, json: async () => responses.shift() };
    },
  });
  assert.equal(result.branchProtected, false);
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'GET', 'GET']);
});
