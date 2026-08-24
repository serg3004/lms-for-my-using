#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

export const patternPolicy = [
  { id: 'disabled-test', severity: 'informational', expression: /\.(?:skip|todo)\s*\(/g },
  { id: 'work-marker', severity: 'informational', expression: /\b(?:TODO|FIXME)\b/g },
  { id: 'console-log', severity: 'informational', expression: /\bconsole\.log\s*\(/g },
  { id: 'explicit-any', severity: 'informational', expression: /\bany\b/g },
  { id: 'dynamic-code-execution', severity: 'blocking', expression: /(?:^|[^\w.])(?:eval|Function)\s*\(/g },
  { id: 'unsafe-html-injection', severity: 'blocking', expression: /\b(?:dangerouslySetInnerHTML|innerHTML)\b/g },
];

const scannedExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const excludedPaths = /^(?:node_modules|dist|coverage|playwright-report|test-results)\//;

export function scanEntries(entries) {
  const findings = [];
  for (const { path, content } of entries) {
    const lines = content.split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
      for (const pattern of patternPolicy) {
        pattern.expression.lastIndex = 0;
        if (pattern.id === 'dynamic-code-execution' && /^\s*eval\([^)]*:\s*/.test(line)) continue;
        if (pattern.expression.test(line)) {
          const severity = pattern.severity === 'blocking' && /(?:^|\/)(?:test|tests|fixtures)(?:\/|\.|-)|\.spec\.[^.]+$/.test(path)
            ? 'informational'
            : pattern.severity;
          findings.push({
            pattern: pattern.id,
            severity,
            path,
            line: lineIndex + 1,
          });
        }
      }
    }
  }
  return findings;
}

function shouldScan(path) {
  if (excludedPaths.test(path)) return false;
  const extension = path.slice(path.lastIndexOf('.'));
  return scannedExtensions.has(extension);
}

async function main() {
  const outputPath = process.argv[2] ?? 'code-hygiene-report.json';
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(shouldScan);
  const entries = await Promise.all(
    files.map(async (path) => ({ path, content: await readFile(path, 'utf8') })),
  );
  const findings = scanEntries(entries);
  const commitSha = process.env.GITHUB_SHA
    ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const counts = Object.fromEntries(
    patternPolicy.map(({ id }) => [id, findings.filter(({ pattern }) => pattern === id).length]),
  );
  const blocking = findings.filter(({ severity }) => severity === 'blocking');
  const report = {
    schemaVersion: 1,
    commitSha,
    generatedAt: new Date().toISOString(),
    policy: {
      scannedExtensions: [...scannedExtensions],
      informational: patternPolicy.filter(({ severity }) => severity === 'informational').map(({ id }) => id),
      blocking: patternPolicy.filter(({ severity }) => severity === 'blocking').map(({ id }) => id),
      explicitAny: 'Informational inventory only; TypeScript and ESLint remain the blocking type-safety gates.',
      testFixtures: 'Unsafe-pattern examples in test and fixture paths are inventoried as informational.',
    },
    summary: { scannedFiles: files.length, findings: findings.length, blocking: blocking.length, counts },
    findings,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Code hygiene: ${files.length} files, ${findings.length} findings, ${blocking.length} blocking`);
  if (blocking.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
