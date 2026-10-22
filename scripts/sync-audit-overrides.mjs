#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { activeExceptions, blockingAdvisories } from './check-dependency-audit.mjs';

const NO_FIX = '<0.0.0';

/** pnpm overrides that lift every fixable blocking advisory to its patched range. */
export function overridesFor(report, exceptionIds = new Set()) {
  const overrides = {};
  for (const a of blockingAdvisories(report, exceptionIds)) {
    if (!a.patched_versions || a.patched_versions === NO_FIX) continue;
    overrides[`${a.module_name}@${a.vulnerable_versions}`] = a.patched_versions;
  }
  return overrides;
}

async function main() {
  const [reportPath, exceptionsPath = 'audit-exceptions.json', manifestPath = 'package.json'] = process.argv.slice(2);
  if (!reportPath) throw new Error('Usage: sync-audit-overrides.mjs <pnpm-audit-report.json> [audit-exceptions.json] [package.json]');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const exceptions = activeExceptions(JSON.parse(await readFile(exceptionsPath, 'utf8')));
  const additions = overridesFor(report, exceptions);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.pnpm ??= {};
  const current = (manifest.pnpm.overrides ??= {});
  const added = Object.keys(additions).filter((key) => current[key] !== additions[key]);
  Object.assign(current, additions);
  if (added.length > 0) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(added.length > 0 ? `Added overrides:\n${added.map((k) => `  ${k} -> ${additions[k]}`).join('\n')}` : 'No new overrides needed');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
