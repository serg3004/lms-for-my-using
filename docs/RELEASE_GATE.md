# Production release gate

> **Status:** `CURRENT PROCEDURE`  
> **Repository baseline:** `ff41214` (2026-08-23; the current `main` snapshot available for PR 162).

This is a fail-closed gate for a **specific SHA and target environment**. Repository checks do not prove live production readiness, and an old GO record must never be reused.

## Required evidence

Create a JSON record outside the repository with these fields:

```json
{
  "releaseId": "release-YYYY-MM-DD",
  "sha": "FULL_40_CHARACTER_GIT_SHA",
  "environment": "production",
  "owner": "named release owner",
  "verifiedAt": "2026-08-23T12:00:00Z",
  "checks": {
    "ci": { "status": "PASS", "evidence": "GitHub Actions run URL/id" },
    "codeql": { "status": "PASS", "evidence": "CodeQL run URL/id" },
    "prismaGenerate": { "status": "PASS", "evidence": "command/run URL and clean diff" },
    "apiSmoke": { "status": "PASS", "evidence": "fresh health/login/RBAC/results/certificate evidence" },
    "webSmoke": { "status": "PASS", "evidence": "fresh login/learner/admin/manager/certificate evidence" },
    "environment": { "status": "PASS", "evidence": "env/dependency verification record" },
    "rollback": { "status": "PASS", "evidence": "tested or approved rollback reference" }
  },
  "blockers": [],
  "acceptedRisks": [
    { "id": "H-004", "reason": "explicit scope rationale", "owner": "risk owner" }
  ],
  "verdict": "GO"
}
```

Run `pnpm release:gate -- /secure/path/release-evidence.json`. The command exits non-zero unless every mandatory check is `PASS`, every check has traceable evidence, the blocker list is empty, and the verdict is `GO`. Accepted risks require an id, reason, and owner; the tool never accepts risk on the owner's behalf.

## Repository verification

Before creating the evidence record, the exact release SHA must pass:

1. frozen dependency install and dependency/security checks;
2. lint and architecture checks for every workspace;
3. Prisma Client generation with no resulting tracked diff;
4. typecheck, coverage tests, migration replay, and database integration tests;
5. API/Web production builds;
6. browser E2E, accessibility, responsive visual checks, and staging-smoke script tests;
7. API and Web container builds and configured Trivy scans;
8. the separate CodeQL workflow.

The current CI workflow executes these repository checks, but it is not proof of branch protection or of the live environment. Record the actual CI and CodeQL run identifiers for the release SHA.

## Mandatory live smoke scope

- liveness and dependency readiness;
- login plus unauthenticated rejection;
- learner navigation and a representative learning/result flow;
- admin navigation and a tenant/RBAC negative case;
- manager-route denial for every non-manager role;
- certificate list/detail/download behavior;
- storage/scanner flows only when included in release scope;
- Sentry/alert delivery, Redis, backups, and rollback where required by the target environment.

Use `docs/PILOT_CHECKLIST.md` for the detailed operator procedure. Any failed required flow, missing live dependency evidence, unaccepted P0/P1 risk, or missing rollback path is `NO_GO`.

## PR 162 verification result

Repository review found no open P0 implementation item. Remaining P1 items are not silently green:

- exact learner course progress remains open (`H-003`);
- next-lesson guidance remains a product-scope decision (`H-004`);
- Dependabot workspace reconciliation remains partial (`H-006`);
- waiver semantic hardening remains conditional on policy (`H-008`).

They require explicit scope disposition and owner acceptance when relevant. Live Redis, storage/scanner, observability routing, backups, deployment smoke, and rollback evidence were not available in the repository. Therefore PR 162 establishes the gate but **does not declare a production GO**.

The verification also found that `@axe-core/playwright@4.13.0` was published without its runtime/type artifacts, which made the E2E workspace typecheck fail after a frozen install. The dependency is pinned to the complete `4.12.1` release so the accessibility gate is executable again.
