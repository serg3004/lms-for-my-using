import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PASS = 'PASS';
const defaultRepoRoot = fileURLToPath(new URL('../', import.meta.url));

// A marker path proving the named module is wired into this checkout, used to
// reject a self-declared `excludedModules` claim the actual candidate SHA
// contradicts. Update this if the module's home directory moves.
const MODULE_PRESENCE_MARKERS = Object.freeze({
  'org-structure': 'apps/api/src/modules/org-structure-admin',
});

export function detectPresentModules(repoRoot = defaultRepoRoot) {
  return Object.entries(MODULE_PRESENCE_MARKERS)
    .filter(([, marker]) => existsSync(resolve(repoRoot, marker)))
    .map(([module]) => module);
}

// These names intentionally describe evidence categories rather than CI job names.
// Job topology is mutable; a release record must instead prove every invariant for
// the exact candidate SHA and target environment.
export const CORE_REQUIRED_CHECKS = Object.freeze([
  'ci',
  'codeql',
  'generatedDocs',
  'accessibility',
  'visualRegression',
  'apiSmoke',
  'webSmoke',
  'environment',
  'rollback',
]);

// Checks required only for a release that contains the named module. Fail-closed
// default: a module is in scope unless the release record explicitly excludes it
// via `excludedModules`, so an operator who says nothing still proves everything.
export const MODULE_REQUIRED_CHECKS = Object.freeze({
  'org-structure': Object.freeze([
    'databaseClean',
    'databaseUpgrade',
    'orgStructureSecurity',
    'orgStructureFlows',
    'orgStructureLifecycle',
    'performance',
    'observability',
    'externalMappings',
  ]),
});

export const REQUIRED_CHECKS = Object.freeze([
  ...CORE_REQUIRED_CHECKS,
  ...Object.values(MODULE_REQUIRED_CHECKS).flat(),
]);

export function validateReleaseEvidence(value, { presentModules = detectPresentModules() } = {}) {
  const errors = [];
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  for (const field of ['releaseId', 'sha', 'environment', 'owner', 'verifiedAt']) {
    if (typeof object[field] !== 'string' || object[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (typeof object.sha === 'string' && !/^[0-9a-f]{40}$/i.test(object.sha)) {
    errors.push('sha must be a full 40-character Git commit SHA');
  }
  if (typeof object.verifiedAt === 'string' && Number.isNaN(Date.parse(object.verifiedAt))) {
    errors.push('verifiedAt must be an ISO-8601 timestamp');
  }

  const checks = object.checks && typeof object.checks === 'object' && !Array.isArray(object.checks)
    ? object.checks
    : {};

  const knownModules = Object.keys(MODULE_REQUIRED_CHECKS);
  let excludedModules = [];
  if (object.excludedModules !== undefined) {
    if (!Array.isArray(object.excludedModules)) {
      errors.push('excludedModules must be an array when provided');
    } else {
      excludedModules = object.excludedModules;
      for (const module of excludedModules) {
        if (!knownModules.includes(module)) {
          errors.push(`excludedModules contains unknown module: ${module}`);
        } else if (presentModules.includes(module)) {
          errors.push(`excludedModules claims '${module}' is absent, but the repository at this candidate still wires it in`);
        }
      }
    }
  }

  // Trust the exclusion only where the candidate itself corroborates it -- a claim
  // the checkout contradicts must not be able to silently drop required evidence.
  const effectivelyExcluded = excludedModules.filter((module) => !presentModules.includes(module));

  const applicableChecks = [
    ...CORE_REQUIRED_CHECKS,
    ...knownModules.filter((module) => !effectivelyExcluded.includes(module)).flatMap((module) => MODULE_REQUIRED_CHECKS[module]),
  ];

  for (const check of applicableChecks) {
    const evidence = checks[check];
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      errors.push(`checks.${check} is required`);
      continue;
    }
    if (evidence.status !== PASS) errors.push(`checks.${check}.status must be PASS`);
    if (typeof evidence.evidence !== 'string' || evidence.evidence.trim() === '') {
      errors.push(`checks.${check}.evidence must be a non-empty string`);
    }
  }

  if (!Array.isArray(object.blockers)) {
    errors.push('blockers must be an array');
  } else if (object.blockers.length > 0) {
    errors.push('blockers must be empty for a GO release');
  }

  if (!Array.isArray(object.acceptedRisks)) {
    errors.push('acceptedRisks must be an array');
  } else {
    object.acceptedRisks.forEach((risk, index) => {
      if (!risk || typeof risk !== 'object' || typeof risk.id !== 'string' || typeof risk.reason !== 'string' || typeof risk.owner !== 'string') {
        errors.push(`acceptedRisks[${index}] must contain string id, reason, and owner`);
      }
    });
  }

  if (object.verdict !== 'GO') errors.push('verdict must be GO');
  return errors;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: pnpm release:gate -- <release-evidence.json>');

  const evidence = JSON.parse(await readFile(file, 'utf8'));
  const errors = validateReleaseEvidence(evidence);
  if (errors.length > 0) {
    console.error(`Release gate: BLOCKED\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Release gate: GO (${evidence.releaseId}, ${evidence.sha})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Release gate: ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
