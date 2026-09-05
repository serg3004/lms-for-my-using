import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PASS = 'PASS';

// These names intentionally describe evidence categories rather than CI job names.
// Job topology is mutable; a release record must instead prove every invariant for
// the exact candidate SHA and target environment.
//
// Every category here is unconditionally mandatory: this repository is a single
// deployable that always contains the org-structure module, so there is no
// release for which "this candidate doesn't contain it" is actually true. An
// earlier revision tried a self-declared, checkout-verified `excludedModules`
// escape hatch for a hypothetical partial release; each attempt to close one
// bypass (a false claim, a stale checkout, a dirty working tree, an incomplete
// presence marker) opened another, because there is no real candidate to
// validate the claim against. Removing the hatch removes the attack surface;
// reintroduce scoping only once a release genuinely without this module exists,
// and prefer deriving scope from that release's own build/deploy manifest over
// re-deriving it from source text.
export const REQUIRED_CHECKS = Object.freeze([
  'ci',
  'codeql',
  'generatedDocs',
  'databaseClean',
  'databaseUpgrade',
  'orgStructureSecurity',
  'orgStructureFlows',
  'orgStructureLifecycle',
  'accessibility',
  'visualRegression',
  'performance',
  'observability',
  'externalMappings',
  'apiSmoke',
  'webSmoke',
  'environment',
  'rollback',
]);

export function validateReleaseEvidence(value) {
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

  for (const check of REQUIRED_CHECKS) {
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
