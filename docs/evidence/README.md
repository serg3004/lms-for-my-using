# Evidence

> **Lifecycle:** `EVIDENCE`.
>
> Этот каталог хранит результаты конкретных проверок и наблюдений. Evidence отвечает на вопрос «что было подтверждено тогда», но не является current implementation, product, API, RBAC, infrastructure или operations authority.

## Правила

- Evidence immutable по смыслу: исторический результат не переписывается вслед за изменением кода или окружения.
- `observed_at`, SHA и environment фиксируются только когда они известны из самого evidence.
- Current state перед использованием перепроверяется по canonical owner-source или live read-back согласно `docs/README.md`.
- Stable procedures остаются в runbooks; execution result хранится здесь.
- Новая проверка создаёт новый evidence record, а не «осовременивает» старый результат.

## Index

| Category | Evidence | observed_at | SHA / environment, если записаны |
|---|---|---|---|
| audits | [CI_AUDIT_BASELINE.md](./audits/CI_AUDIT_BASELINE.md) | 2026-08-09 | `4585e8b641b65484a6a29d2383d46f259a3e1e15` |
| audits | [DOCUMENTATION_AUDIT.md](./audits/DOCUMENTATION_AUDIT.md) | не указано | consolidation provenance: PR #512 / `4f1a377adcec687843f60ddcb7e2b5977f67273b` |
| audits | [DEAD_CODE_AUDIT.md](./audits/DEAD_CODE_AUDIT.md) | 2026-08-02 | `76edd162e56e2f485d069724c567501309f2cc06` |
| audits | [FRONTEND_MVP_MAINTAINABILITY_AUDIT.md](./audits/FRONTEND_MVP_MAINTAINABILITY_AUDIT.md) | 2026-08-06 | не указаны |
| audits | [PR_89_102_VERIFICATION.md](./audits/PR_89_102_VERIFICATION.md) | 2026-06-04 | не указан |
| performance | [PAGINATION_QUERY_PERFORMANCE_AUDIT.md](./performance/PAGINATION_QUERY_PERFORMANCE_AUDIT.md) | 2026-08-09 | environment/SHA не зафиксированы как completed measurement |
| performance | [PR259_FRONTEND_PERFORMANCE_VERIFICATION.md](./performance/PR259_FRONTEND_PERFORMANCE_VERIFICATION.md) | 2026-08-25 | local production build + seeded demo DB; SHA не указан |
| production | [PR265_PRODUCTION_VERIFICATION.md](./production/PR265_PRODUCTION_VERIFICATION.md) | 2026-08-25 | `d1570ab`; Railway `production` |
| observability | [PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md](./observability/PR_130_PRODUCTION_OBSERVABILITY_VERIFICATION.md) | 2026-08-22 | repository evidence; production integrations `LIVE-VERIFY` |
| observability | [PR_161_OBSERVABILITY_VERIFICATION.md](./observability/PR_161_OBSERVABILITY_VERIFICATION.md) | 2026-08-23 | repository evidence; production delivery `LIVE-VERIFY` |
| security | [SECURITY_AUDIT_PR_153.md](./security/SECURITY_AUDIT_PR_153.md) | не указано | не указаны |
| smoke | [RAILWAY_PRODUCTION_SMOKE_STATUS.md](./smoke/RAILWAY_PRODUCTION_SMOKE_STATUS.md) | 2026-07-08 | historical production smoke; SHA не указан |
| smoke | [STAGING_SMOKE_REPORT.md](./smoke/STAGING_SMOKE_REPORT.md) | 2026-06-06 / 2026-06-07 | second smoke: `5fa966e249c0fabd683fd2e868f72f9335010a54` |
| incidents | [INCIDENT_RESPONSE_TABLETOP_2026-08-22.md](./incidents/INCIDENT_RESPONSE_TABLETOP_2026-08-22.md) | 2026-08-22 | documentation/tabletop exercise; production systems not used |

## Что остаётся current

Процедуры не являются evidence и остаются в current documentation до taxonomy move DOC-07. В частности:

- `docs/runbooks/INCIDENT_RESPONSE.md`;
- `docs/runbooks/BACKUP_RESTORE_DISASTER_RECOVERY.md`;
- `docs/runbooks/SLO_ALERTS.md`;
- `docs/LOAD_TESTING_BASELINE.md` как методика/acceptance baseline, а не completed measurement;
- `docs/OBSERVABILITY.md` как current repository/operations guidance.
