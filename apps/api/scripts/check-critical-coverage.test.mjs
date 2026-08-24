import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCriticalPathReport, criticalPaths, thresholdFailures } from './check-critical-coverage.mjs';

const metric = (covered, total = 100) => ({ covered, total, skipped: 0, pct: covered });
const entry = (covered = 100) => ({
  statements: metric(covered),
  branches: metric(covered),
  functions: metric(covered),
  lines: metric(covered),
});

test('aggregates every declared critical path and detects regression', () => {
  const coverage = {
    '/repo/src/modules/auth/auth.tokens.ts': entry(),
    '/repo/src/modules/course-access/course-access.policy.ts': entry(),
    '/repo/src/modules/progress/progress.service.ts': entry(),
    '/repo/src/modules/upload/upload.service.ts': entry(),
    '/repo/src/modules/background-jobs/background-jobs.service.ts': entry(),
  };
  const report = buildCriticalPathReport(coverage);

  assert.deepEqual(Object.keys(report), Object.keys(criticalPaths));
  assert.deepEqual(thresholdFailures(report), []);
  report.progress.coverage.functions = 0;
  assert.match(thresholdFailures(report)[0], /progress functions/);
});

test('fails closed when a critical path stops matching collected source', () => {
  assert.throws(() => buildCriticalPathReport({}), /No coverage files matched critical path/);
});
