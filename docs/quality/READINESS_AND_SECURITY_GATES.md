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

## Checklist workplace-training production gates (PR 308)

`docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md`'s PR 308 requires each
of its listed production gates to be confirmed by actual verification, not left "unknown" when
prior work already confirmed it. Fresh Railway read-back (`serg3004/lms-for-my-using`, project
`reasonable-reprieve`, environment `production`, services `api`/`web`/`minio`/`malware-scanner`,
2026-09-25) found:

- **Redis / background worker -- `LIVE-VERIFIED`, and the answer is negative.** The production
  `api` service has no `REDIS_URL` variable at all (`ALLOW_IN_MEMORY_RATE_LIMIT` is set instead,
  the only way the app's own `env.ts` startup validation would have allowed it to boot without
  one). `BackgroundJobsModule`'s provider factory (`apps/api/src/modules/background-jobs/
  background-jobs.module.ts`) is unconditional: `process.env['REDIS_URL'] ? new
  BullMqBackgroundJobBackend(...) : new DisabledBackgroundJobBackend()` -- no other code path
  exists. **This means every recurring background job is currently inert in production**,
  including the pre-existing `ChecklistDeadlineWorker` (predates this module) and the new
  `ChecklistSessionReminderWorker` (PR 291): `DisabledBackgroundJobBackend.upsertRecurring()`
  silently no-ops (the scan job never gets scheduled) and `.enqueue()` throws
  `ServiceUnavailableException`. The plan's own PR 308 bullet assumed this gate was "already
  confirmed" via the pre-existing worker; that assumption does not hold for the live deployment as
  of this check. Separately, and independently blocking, neither delivery webhook the checklist
  reminder or password-reset flow needs (`CHECKLIST_SESSION_REMINDER_DELIVERY_URL`,
  `PASSWORD_RESET_DELIVERY_URL`) is configured either -- both are documented as a valid no-op when
  absent, so even with Redis this would not yet send real email. Provisioning a Redis service and
  the delivery webhook is an infrastructure change outside a documentation PR's scope; flagged here
  for an explicit owner decision rather than silently left undiscovered.
- **Object storage + CORS/presigned upload/download -- partially `LIVE-VERIFIED`.** The `minio`
  service is `live` with a persistent 5GB volume and a successful latest deployment; the `api` and
  `malware-scanner` services both carry matching `S3_*` variables. Direct outbound HTTP from this
  sandbox is proxy-restricted (cannot fetch the bucket's actual CORS policy or exercise a real
  presigned upload/download round-trip), so the specific CORS configuration and a live
  upload/download smoke test remain `LIVE-VERIFY`.
- **Mail provider/SLA -- `LIVE-VERIFIED`, and it is unconfigured.** See the Redis bullet above:
  both delivery webhook URLs are absent from the production `api` service's variables, which the
  code treats as an intentional no-op rather than a startup failure. No SLA exists to evaluate
  because no provider is wired up.
- **Geolocation retention/legal policy -- not a gap to close here.** Already tracked as an
  explicit open owner decision, `docs/status/OPEN_DECISIONS.md` DEC-CHKS-002: retention/deletion
  is deliberately unimplemented pending an owner decision on period/mechanism, documented as a
  release blocker for a future dedicated retention feature, not for this module's own PRs.
- **Production-like load/latency -- deferred, not an obligation.** `docs/status/
  OPEN_DECISIONS.md`'s "Deferred, не open decisions" section already states the load-test release
  gate is deferred until a concrete target (dataset, latency/error thresholds, environment) exists;
  PR 308 does not introduce a new obligation here.
- **Observability/alerts -- partially `CONFIGURED`.** A checklist-specific Prometheus counter
  exists (`lms_checklist_session_reminder_delivery_errors_total`,
  `apps/api/src/common/observability/metrics.ts`) alongside the generic metrics endpoint (gated by
  `METRICS_BEARER_TOKEN`, present in production). Whether this metric is actually wired to a live
  alert (Sentry/PagerDuty threshold) requires access to that alerting platform, not just repository
  config, and remains `LIVE-VERIFY`.

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
