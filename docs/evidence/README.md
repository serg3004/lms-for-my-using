# Evidence

> **Lifecycle:** `EVIDENCE`.
>
> This directory records what was observed at a specific time/SHA/environment. Evidence is not current implementation, product, API, RBAC, infrastructure or operations authority.

## Rules

- Do not rewrite historical results to match newer code.
- Record date/SHA/environment when known from the evidence itself; missing historical metadata stays explicitly unknown rather than invented.
- Current state must be re-verified from canonical owners or fresh live read-back.
- Stable procedures belong in runbooks; execution results belong here.
- A new verification creates a new evidence record.

## Index

| Category | Evidence | observed_at | SHA / environment, если записаны |
| --- | --- | --- | --- |
| audits | [CI_AUDIT_BASELINE.md](./audits/CI_AUDIT_BASELINE.md) | 2026-08-09 | `4585e8b641b65484a6a29d2383d46f259a3e1e15` |
| audits | [DOCUMENTATION_AUDIT.md](./audits/DOCUMENTATION_AUDIT.md) | не указано | consolidation provenance: PR #512 / `4f1a377adcec687843f60ddcb7e2b5977f67273b` |
| audits | [DEAD_CODE_AUDIT.md](./audits/DEAD_CODE_AUDIT.md) | 2026-08-02 | `76edd162e56e2f485d069724c567501309f2cc06` |
| audits | [FRONTEND_MVP_MAINTAINABILITY_AUDIT.md](./audits/FRONTEND_MVP_MAINTAINABILITY_AUDIT.md) | 2026-08-06 | не указаны |
| audits | [PR_89_102_VERIFICATION.md](./audits/PR_89_102_VERIFICATION.md) | 2026-06-04 | не указан |
| audits | [DOC_12_FINAL_INTEGRITY_AUDIT_2026-08-27.md](./audits/DOC_12_FINAL_INTEGRITY_AUDIT_2026-08-27.md) | 2026-08-27 | DOC-12 branch/PR SHA + GitHub live read-back recorded inside |
| performance | [PAGINATION_QUERY_PERFORMANCE_AUDIT.md](./performance/PAGINATION_QUERY_PERFORMANCE_AUDIT.md) | 2026-08-09 | environment/SHA not recorded as completed measurement |
| performance | [PR259_FRONTEND_PERFORMANCE_VERIFICATION.md](./performance/PR259_FRONTEND_PERFORMANCE_VERIFICATION.md) | 2026-08-25 | local production build + seeded demo DB; SHA не указан |
| performance | [PR281_ORG_STRUCTURE_PERFORMANCE_VERIFICATION.md](./performance/PR281_ORG_STRUCTURE_PERFORMANCE_VERIFICATION.md) | 2026-09-03 | local disposable PostgreSQL 16; SHA не указан |
| production | [PR265_PRODUCTION_VERIFICATION.md](./production/PR265_PRODUCTION_VERIFICATION.md) | 2026-08-25 | `d1570ab`; Railway `production` |
| observability | [PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md](./observability/PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md) | 2026-08-22 | repository evidence; production integrations `LIVE-VERIFY` |
| observability | [PR_161_OBSERVABILITY_VERIFICATION.md](./observability/PR_161_OBSERVABILITY_VERIFICATION.md) | 2026-08-23 | repository evidence; production delivery `LIVE-VERIFY` |
| security | [SECURITY_AUDIT_PR_153.md](./security/SECURITY_AUDIT_PR_153.md) | не указано | не указаны |
| smoke | [RAILWAY_PRODUCTION_SMOKE_STATUS.md](./smoke/RAILWAY_PRODUCTION_SMOKE_STATUS.md) | 2026-07-08 | historical production smoke; SHA не указан |
| smoke | [STAGING_SMOKE_REPORT.md](./smoke/STAGING_SMOKE_REPORT.md) | 2026-06-06 / 2026-06-07 | second smoke: `5fa966e249c0fabd683fd2e868f72f9335010a54` |
| incidents | [INCIDENT_RESPONSE_TABLETOP_2026-08-22.md](./incidents/INCIDENT_RESPONSE_TABLETOP_2026-08-22.md) | 2026-08-22 | documentation/tabletop exercise; production systems not used |

## Current procedures are elsewhere

Evidence must not become a runbook. Current operational procedures live under [`../runbooks/`](../runbooks/); current quality/readiness semantics live under [`../quality/`](../quality/). In particular, load-testing methodology is [`../quality/LOAD_TESTING_BASELINE.md`](../quality/LOAD_TESTING_BASELINE.md) and observability procedure is [`../runbooks/OBSERVABILITY.md`](../runbooks/OBSERVABILITY.md).
