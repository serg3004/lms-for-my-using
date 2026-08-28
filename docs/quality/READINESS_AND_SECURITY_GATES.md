# Readiness and Security Gates

> **Статус:** `CURRENT` semantics / verification procedure.
>
> **Rule:** repository configuration, executed checks, merge enforcement and live environment state are distinct evidence levels. Current workflow/ruleset names must be re-read when they matter; this document does not freeze them as eternal inventory.

## Evidence levels

- `CONFIGURED` — a check/probe exists in current code/config.
- `EXECUTED` — the relevant check actually ran for a specific SHA.
- `PASSED` — that run completed successfully.
- `MERGE-ENFORCED` — fresh repository settings show that merge requires the relevant checks.
- `LIVE-VERIFIED` — external runtime/provider state was freshly verified for the target environment.
- `LIVE-VERIFY` — repository state alone cannot prove the claim.

Do not call a check blocking based only on configuration or execution.

## Runtime health/readiness

The API exposes liveness and readiness endpoints. Current controller/service code owns their exact paths/payloads.

Readiness evaluates configured dependencies such as database, Redis and S3-compatible storage. A dependency may be intentionally disabled by configuration; technical readiness in such a mode does not prove production/security compliance.

On failed required dependency, the public readiness contract uses the canonical API error layer. Internal dependency exception messages must not be treated as public API fields.

## Repository CI/security

Workflow implementation is owned by `.github/workflows/ci.yml` and `.github/workflows/codeql.yml`. The current CI chain includes documentation consistency together with security, lint/typecheck/tests/build and other configured repository gates; exact job topology must be read from the workflow when making a current claim.

Documentation consistency is invoked through `pnpm docs:consistency:test`; generated drift and docs-impact enforcement remain inside that chain.

### Trivy semantics

When the current workflow uses `--ignore-unfixed`, unfixed findings are excluded from its blocking result. Security-waiver behavior must be described according to the current validator/workflow and must not be generalized to unrelated scanners.

## Merge enforcement

`MERGE-ENFORCED` is always a live GitHub setting. Before asserting it:

1. read the active ruleset/branch policy applying to `main`;
2. record the required check contexts and strict/up-to-date behavior;
3. bind the observation to date/time and, when relevant, the repository SHA;
4. keep that observation in dated evidence rather than turning the current names into a permanent Markdown contract.

The DOC-12 final audit records the fresh ruleset read-back used to close the documentation remediation series.

## Production readiness

The following remain `LIVE-VERIFY` unless fresh external evidence exists:

- Redis availability/topology;
- S3-compatible provider/bucket/CORS/lifecycle;
- malware scanner availability;
- Railway services/domains/deployment state;
- alert/Sentry delivery;
- backups/PITR/restore readiness;
- production smoke and rollback evidence.

Repository code/config proves intended/implemented behavior, not current production state.

## Release interpretation

A production/pilot decision must bind evidence to an exact SHA and target environment. Use [`../runbooks/RELEASE_GATE.md`](../runbooks/RELEASE_GATE.md) and [`../runbooks/PILOT_CHECKLIST.md`](../runbooks/PILOT_CHECKLIST.md). Old GO/smoke records cannot be reused for a newer SHA/environment.

## AI rules

1. Distinguish configured, executed, passed, merge-enforced and live-verified.
2. Do not assert protected/required-check state without fresh GitHub read-back.
3. Do not infer live provider state from repository config.
4. Do not extend one tool's waiver semantics to another security tool.
5. Bind volatile claims to fresh evidence instead of maintaining a manual inventory here.

## Related docs

- [`../contracts/RATE_LIMIT_FAILURE_POLICY.md`](../contracts/RATE_LIMIT_FAILURE_POLICY.md)
- [`../evidence/audits/CI_AUDIT_BASELINE.md`](../evidence/audits/CI_AUDIT_BASELINE.md)
- [`../evidence/audits/DOC_12_FINAL_INTEGRITY_AUDIT_2026-08-27.md`](../evidence/audits/DOC_12_FINAL_INTEGRITY_AUDIT_2026-08-27.md)
