import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const coverageProfile = process.env.CI === 'true' ? 'ci' : 'local';
const baseline = (local, ci) => (coverageProfile === 'ci' ? ci : local);

export const criticalPaths = {
  'auth-session': {
    pattern: /\/modules\/auth\/(auth\.(?:guard|lifecycle|refresh-tokens|session-store|tokens)|organization-scope\.guard|roles\.guard)\.ts$/,
    baseline: { statements: 99.08, branches: 88.31, functions: 100, lines: 99.08 },
  },
  'rbac-course-access': {
    pattern: /\/modules\/(?:auth\/(?:organization-scope(?:\.guard)?|roles(?:\.guard)?)|course-access\/[^/]+|courses\/courses\.(?:controller|service))\.ts$/,
    baseline: baseline(
      { statements: 91.05, branches: 75.45, functions: 74.51, lines: 91.05 },
      { statements: 90.52, branches: 75.45, functions: 77.55, lines: 90.52 },
    ),
  },
  progress: {
    pattern: /\/modules\/progress\/[^/]+\.ts$/,
    baseline: { statements: 91.74, branches: 80, functions: 89.47, lines: 91.74 },
  },
  'upload-multipart': {
    pattern: /\/modules\/(?:upload\/[^/]+|course-materials\/material-(?:multipart-upload|storage-lifecycle|malware-scan)\.service)\.ts$/,
    baseline: { statements: 73.62, branches: 81.33, functions: 71.11, lines: 73.62 },
  },
  'background-jobs': {
    pattern: /\/modules\/(?:background-jobs\/[^/]+|outbox\/[^/]+|checklists\/checklist-deadline\.worker)\.ts$/,
    baseline: baseline(
      { statements: 61.97, branches: 62.75, functions: 44.44, lines: 61.97 },
      { statements: 59.46, branches: 64.15, functions: 56.25, lines: 59.46 },
    ),
  },
};

const metrics = ['statements', 'branches', 'functions', 'lines'];

export function buildCriticalPathReport(coverage) {
  return Object.fromEntries(
    Object.entries(criticalPaths).map(([name, definition]) => {
      const files = Object.entries(coverage).filter(
        ([filename]) => filename !== 'total' && definition.pattern.test(filename.replaceAll('\\', '/')),
      );
      if (files.length === 0) throw new Error(`No coverage files matched critical path: ${name}`);

      const result = { files: files.map(([filename]) => filename), coverage: {}, baseline: definition.baseline };
      for (const metric of metrics) {
        const total = files.reduce((sum, [, value]) => sum + value[metric].total, 0);
        const covered = files.reduce((sum, [, value]) => sum + value[metric].covered, 0);
        result.coverage[metric] = Number(((covered / total) * 100).toFixed(2));
      }
      return [name, result];
    }),
  );
}

export function thresholdFailures(report) {
  return Object.entries(report).flatMap(([name, result]) =>
    metrics
      .filter((metric) => result.coverage[metric] < result.baseline[metric])
      .map(
        (metric) =>
          `${name} ${metric}: ${result.coverage[metric]}% is below baseline ${result.baseline[metric]}%`,
      ),
  );
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const coverage = JSON.parse(await readFile(path.join(root, 'coverage/coverage-summary.json'), 'utf8'));
  const report = buildCriticalPathReport(coverage);
  console.log(`Critical-path coverage profile: ${coverageProfile}`);
  await writeFile(
    path.join(root, 'coverage/critical-path-summary.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  for (const [name, result] of Object.entries(report)) {
    console.log(
      `${name}: ${metrics.map((metric) => `${metric} ${result.coverage[metric]}%`).join(', ')}`,
    );
  }
  const failures = thresholdFailures(report);
  if (failures.length) throw new Error(`Critical-path coverage regressed:\n${failures.join('\n')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
