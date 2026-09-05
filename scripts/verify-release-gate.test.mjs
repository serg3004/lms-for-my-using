import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_CHECKS, validateReleaseEvidence } from './verify-release-gate.mjs';

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

test('rejects a verifiedAt timestamp in the future', () => {
  const evidence = structuredClone(passingEvidence);
  evidence.verifiedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const errors = validateReleaseEvidence(evidence);
  assert(errors.includes('verifiedAt must not be in the future'));
});
