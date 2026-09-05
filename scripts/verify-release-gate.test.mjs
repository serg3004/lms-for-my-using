import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_CHECKS, detectPresentModules, getCheckoutSha, validateReleaseEvidence } from './verify-release-gate.mjs';

const passingEvidence = {
  releaseId: 'release-2026-08-23',
  sha: 'a'.repeat(40),
  environment: 'production',
  owner: 'release-owner',
  verifiedAt: '2026-08-23T12:00:00Z',
  checks: Object.fromEntries(
    REQUIRED_CHECKS.map((name) => [name, { status: 'PASS', evidence: `run:${name}` }]),
  ),
  blockers: [],
  acceptedRisks: [{ id: 'H-004', reason: 'Not required for this release scope', owner: 'product-owner' }],
  verdict: 'GO',
};

test('accepts complete GO evidence', () => {
  assert.deepEqual(validateReleaseEvidence(passingEvidence), []);
});

test('fails closed on a failed check, blocker, and non-GO verdict', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.checks.ci.status = 'FAIL';
  evidence.blockers.push('production smoke failed');
  evidence.verdict = 'NO_GO';
  const errors = validateReleaseEvidence(evidence);
  assert(errors.includes('checks.ci.status must be PASS'));
  assert(errors.includes('blockers must be empty for a GO release'));
  assert(errors.includes('verdict must be GO'));
});

test('requires traceable evidence for every release check', () => {
  const evidence = structuredClone(passingEvidence);
  delete evidence.checks.codeql;
  evidence.checks.webSmoke.evidence = '';
  const errors = validateReleaseEvidence(evidence);
  assert(errors.includes('checks.codeql is required'));
  assert(errors.includes('checks.webSmoke.evidence must be a non-empty string'));
});

test('fails closed when org-structure integration evidence is missing', () => {
  const evidence = structuredClone(passingEvidence);
  for (const check of [
    'databaseClean',
    'databaseUpgrade',
    'orgStructureSecurity',
    'orgStructureFlows',
    'orgStructureLifecycle',
    'performance',
    'observability',
    'externalMappings',
  ]) {
    delete evidence.checks[check];
  }

  const errors = validateReleaseEvidence(evidence);
  assert.deepEqual(errors, [
    'checks.databaseClean is required',
    'checks.databaseUpgrade is required',
    'checks.orgStructureSecurity is required',
    'checks.orgStructureFlows is required',
    'checks.orgStructureLifecycle is required',
    'checks.performance is required',
    'checks.observability is required',
    'checks.externalMappings is required',
  ]);
});

test('does not accept documentation assertions as successful runtime evidence', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.checks.orgStructureSecurity.status = 'DOCUMENTED';
  evidence.checks.databaseUpgrade.status = 'NOT_VERIFIED';

  const errors = validateReleaseEvidence(evidence);
  assert(errors.includes('checks.orgStructureSecurity.status must be PASS'));
  assert(errors.includes('checks.databaseUpgrade.status must be PASS'));
});

test('excludedModules drops that module\'s checks only when the candidate actually lacks it', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.excludedModules = ['org-structure'];
  for (const check of [
    'databaseClean',
    'databaseUpgrade',
    'orgStructureSecurity',
    'orgStructureFlows',
    'orgStructureLifecycle',
    'performance',
    'observability',
    'externalMappings',
  ]) {
    delete evidence.checks[check];
  }

  assert.deepEqual(validateReleaseEvidence(evidence, { presentModules: [] }), []);
});

test('rejects an excludedModules claim the candidate contradicts', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.excludedModules = ['org-structure'];

  const errors = validateReleaseEvidence(evidence, { presentModules: ['org-structure'] });
  assert(errors.includes("excludedModules claims 'org-structure' is absent, but the repository at this candidate still wires it in"));
});

test('by default (no presentModules override) rejects an excludedModules claim against this actual checkout', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.excludedModules = ['org-structure'];
  for (const check of [
    'databaseClean',
    'databaseUpgrade',
    'orgStructureSecurity',
    'orgStructureFlows',
    'orgStructureLifecycle',
    'performance',
    'observability',
    'externalMappings',
  ]) {
    delete evidence.checks[check];
  }

  const errors = validateReleaseEvidence(evidence);
  assert(errors.includes("excludedModules claims 'org-structure' is absent, but the repository at this candidate still wires it in"));
  assert(errors.includes('checks.databaseClean is required'));
});

test('rejects an unknown excludedModules entry and a non-array value', () => {
  const unknownModule = structuredClone(passingEvidence);
  unknownModule.excludedModules = ['not-a-real-module'];
  assert(validateReleaseEvidence(unknownModule).includes('excludedModules contains unknown module: not-a-real-module'));

  const notAnArray = structuredClone(passingEvidence);
  notAnArray.excludedModules = 'org-structure';
  assert(validateReleaseEvidence(notAnArray).includes('excludedModules must be an array when provided'));
});

test('rejects excludedModules when the inspected checkout is not the declared candidate sha', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.sha = 'b'.repeat(40);
  evidence.excludedModules = ['org-structure'];

  const errors = validateReleaseEvidence(evidence, { checkoutSha: 'c'.repeat(40) });
  assert(errors.some((error) => error.startsWith('excludedModules cannot be trusted:')));
});

test('does not require a matching checkoutSha when the caller supplies presentModules directly', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.excludedModules = ['org-structure'];
  for (const check of [
    'databaseClean',
    'databaseUpgrade',
    'orgStructureSecurity',
    'orgStructureFlows',
    'orgStructureLifecycle',
    'performance',
    'observability',
    'externalMappings',
  ]) {
    delete evidence.checks[check];
  }

  // presentModules is supplied directly, so detection (and the sha binding it needs) never runs.
  assert.deepEqual(validateReleaseEvidence(evidence, { presentModules: [], checkoutSha: 'unused' }), []);
});

test('detectPresentModules finds org-structure via its AppModule import wiring', () => {
  assert.deepEqual(detectPresentModules(), ['org-structure']);
});

test('detectPresentModules reports nothing for a repo root without app.module.ts', () => {
  assert.deepEqual(detectPresentModules('/nonexistent/repo/root'), []);
});

test('getCheckoutSha returns this checkout\'s actual commit', () => {
  const sha = getCheckoutSha();
  assert.match(sha, /^[0-9a-f]{40}$/);
});

test('getCheckoutSha returns null for a path with no git checkout', () => {
  assert.equal(getCheckoutSha('/nonexistent/repo/root'), null);
});
