#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

export function vulnerabilityCounts(report) {
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') throw new Error('Dependency audit report has no vulnerability summary');
  return Object.fromEntries(
    ['info', 'low', 'moderate', 'high', 'critical'].map((severity) => [severity, Number(counts[severity] ?? 0)]),
  );
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error('Usage: check-dependency-audit.mjs <pnpm-audit-report.json>');
  const counts = vulnerabilityCounts(JSON.parse(await readFile(reportPath, 'utf8')));
  console.log(`Dependency audit: ${counts.high} HIGH, ${counts.critical} CRITICAL`);
  if (counts.high > 0 || counts.critical > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
