import assert from 'node:assert/strict';
import test from 'node:test';
import { activeExceptions, blockingAdvisories, vulnerabilityCounts } from './check-dependency-audit.mjs';
import { scanEntries } from './generate-code-hygiene-report.mjs';

test('code hygiene separates informational and blocking findings', () => {
  const findings = scanEntries([{ path: 'sample.ts', content: '// TODO\nconst value: any = eval(input);' }]);
  assert.deepEqual(
    findings.map(({ pattern, severity, line }) => ({ pattern, severity, line })),
    [
      { pattern: 'work-marker', severity: 'informational', line: 1 },
      { pattern: 'explicit-any', severity: 'informational', line: 2 },
      { pattern: 'dynamic-code-execution', severity: 'blocking', line: 2 },
    ],
  );
});

test('unsafe examples in test files are informational', () => {
  const findings = scanEntries([
    { path: 'example.test.mjs', content: 'eval(input);' },
    { path: 'tests/example.mjs', content: 'eval(input);' },
  ]);
  assert.deepEqual(findings.map(({ severity }) => severity), ['informational', 'informational']);
});

test('dependency audit normalizes missing severity counts', () => {
  assert.deepEqual(vulnerabilityCounts({ metadata: { vulnerabilities: { high: 2 } } }), {
    info: 0, low: 0, moderate: 0, high: 2, critical: 0,
  });
});

test('dependency audit rejects a malformed report', () => {
  assert.throws(() => vulnerabilityCounts({}), /no vulnerability summary/);
});

const advisory = (module_name, severity, patched_versions, extra = {}) => ({
  module_name, severity, patched_versions, vulnerable_versions: '<9.9.9', github_advisory_id: `GHSA-${module_name}`, cves: [], ...extra,
});
const report = {
  advisories: {
    1: advisory('fixable', 'critical', '>=9.9.9'),
    2: advisory('unfixable', 'high', '<0.0.0'),
    3: advisory('minor', 'moderate', '>=9.9.9'),
  },
};

test('active exceptions cover blocking advisories by GHSA id or CVE until they expire', () => {
  const policy = { version: 1, exceptions: [{ id: 'GHSA-unfixable', owner: 'o', reason: 'r', expires: '2030-01-01' }] };
  assert.deepEqual(blockingAdvisories(report, activeExceptions(policy, '2029-12-31')).map((a) => a.module_name), ['fixable']);
  assert.deepEqual(blockingAdvisories(report, activeExceptions(policy, '2030-01-02')).map((a) => a.module_name), ['fixable', 'unfixable']);
  const byCve = { advisories: { 1: advisory('x', 'high', '<0.0.0', { cves: ['CVE-1'] }) } };
  assert.equal(blockingAdvisories(byCve, new Set(['CVE-1'])).length, 0);
});

test('exception policy rejects malformed entries', () => {
  assert.throws(() => activeExceptions({ version: 1, exceptions: [{ id: 'x' }] }), /owner/);
});
