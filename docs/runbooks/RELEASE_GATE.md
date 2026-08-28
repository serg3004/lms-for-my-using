# Production release gate

> **Status:** `CURRENT PROCEDURE`.
>
> This is a fail-closed gate for a specific SHA and target environment. Repository checks do not prove live production readiness, and an old GO record must never be reused.

## Required evidence

Create a release record outside the repository containing at least:

```json
{
  "releaseId": "release-YYYY-MM-DD",
  "sha": "FULL_40_CHARACTER_GIT_SHA",
  "environment": "production",
  "owner": "named release owner",
  "verifiedAt": "ISO-8601 timestamp",
  "checks": {
    "ci": { "status": "PASS", "evidence": "GitHub Actions run URL/id" },
    "codeql": { "status": "PASS", "evidence": "CodeQL run URL/id" },
    "generatedDocs": { "status": "PASS", "evidence": "generation/check + clean diff" },
    "apiSmoke": { "status": "PASS", "evidence": "fresh runtime evidence" },
    "webSmoke": { "status": "PASS", "evidence": "fresh Web evidence" },
    "environment": { "status": "PASS", "evidence": "dependency/environment verification" },
    "rollback": { "status": "PASS", "evidence": "tested or approved rollback reference" }
  },
  "blockers": [],
  "acceptedRisks": [],
  "verdict": "GO"
}
```

Run `pnpm release:gate -- /secure/path/release-evidence.json`. The command is fail-closed: every mandatory check needs `PASS` plus traceable evidence, blockers must be empty, and accepted risks require explicit owner/rationale.

## Repository verification

For the exact release SHA, use the current workflow and package scripts as authority. At minimum verify:

- required CI aggregate is green;
- required CodeQL analysis is green;
- `pnpm docs:consistency:test` is green;
- generated documentation check/generation ends with a clean tracked diff;
- current lint/typecheck/tests/build and security/container gates required by CI are green.

Do not copy the current CI job topology into this runbook as a permanent inventory. Record actual run IDs for the release SHA.

## Merge enforcement

If branch/ruleset enforcement is part of release evidence, perform a fresh GitHub settings read-back. Required check names and strictness are live platform state, not a stable contract in this file. See [`../quality/READINESS_AND_SECURITY_GATES.md`](../quality/READINESS_AND_SECURITY_GATES.md).

## Mandatory live smoke scope

Select the flows required by release scope, including where relevant:

- liveness/readiness;
- login and unauthenticated rejection;
- representative learner flow;
- role/RBAC/tenant negative path;
- required admin/manager/instructor/mentor surface;
- certificate behavior;
- storage/scanner only when in release scope;
- Redis, observability delivery, backups and rollback when required by target policy.

Use [`PILOT_CHECKLIST.md`](./PILOT_CHECKLIST.md) as the detailed operator checklist. Any failed required flow, missing required live evidence, unaccepted blocker, or missing recovery path is `NO_GO`.

## Evidence discipline

- Repository CI proves repository state only.
- Live provider/deployment state requires fresh external evidence.
- Historical audit/smoke records remain evidence of their own snapshot and do not become a new release GO.
- Owner risk acceptance cannot be inferred or performed by an agent.

The pre-DOC-12 version of this runbook, including its PR-specific verification snapshot, is preserved in `docs/archive/remediation/RELEASE_GATE_PRE_DOC12.md` as history and is not current release authority.
