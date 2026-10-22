#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const BLOCKING = ['high', 'critical'];

export function vulnerabilityCounts(report) {
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') throw new Error('Dependency audit report has no vulnerability summary');
  return Object.fromEntries(
    ['info', 'low', 'moderate', 'high', 'critical'].map((severity) => [severity, Number(counts[severity] ?? 0)]),
  );
}

export function activeExceptions(policy, today = new Date().toISOString().slice(0, 10)) {
  if (policy?.version !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error('Dependency audit exceptions must have version 1 and an exceptions array');
  }
  const ids = new Set();
  for (const [index, entry] of policy.exceptions.entries()) {
    for (const field of ['id', 'owner', 'reason', 'expires']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        throw new Error(`exceptions[${index}].${field} must be a non-empty string`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) throw new Error(`exceptions[${index}].expires must be an ISO date`);
    if (ids.has(entry.id)) throw new Error(`exceptions[${index}].id must be unique`);
    ids.add(entry.id);
  }
  // An expired exception lapses: the advisory blocks again until it is fixed or consciously renewed.
  return new Set(policy.exceptions.filter(({ expires }) => expires >= today).map(({ id }) => id));
}

/** High/critical advisories not covered by an active exception (matched by GHSA id or CVE). */
export function blockingAdvisories(report, exceptionIds = new Set()) {
  return Object.values(report?.advisories ?? {}).filter(
    (advisory) =>
      BLOCKING.includes(advisory.severity) &&
      ![advisory.github_advisory_id, ...(advisory.cves ?? [])].some((id) => id && exceptionIds.has(id)),
  );
}

async function main() {
  const [reportPath, exceptionsPath] = process.argv.slice(2);
  if (!reportPath) throw new Error('Usage: check-dependency-audit.mjs <pnpm-audit-report.json> [audit-exceptions.json]');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const counts = vulnerabilityCounts(report);
  const exceptions = exceptionsPath ? activeExceptions(JSON.parse(await readFile(exceptionsPath, 'utf8'))) : new Set();
  const blocking = blockingAdvisories(report, exceptions);
  console.log(`Dependency audit: ${counts.high} HIGH, ${counts.critical} CRITICAL (${blocking.length} not covered by an active exception)`);
  for (const a of blocking) {
    console.log(`- [${a.severity}] ${a.module_name} ${a.vulnerable_versions} (fixed: ${a.patched_versions}) ${a.github_advisory_id ?? ''} ${a.url ?? ''}`);
  }
  if (blocking.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
