import assert from 'node:assert/strict';
import test from 'node:test';
import { vulnerabilityCounts } from './check-dependency-audit.mjs';
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
