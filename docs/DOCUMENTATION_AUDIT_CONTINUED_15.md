# Продолжение аудита актуальности документации — часть 15

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_14.md` содержат результаты №21–34. Этот файл продолжает последовательный аудит с №35.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 35 | `READINESS_AND_SECURITY_GATES.md` | ⚠️ Частично актуален | Health intent и security tooling в основном подтверждены, но merge enforcement выключен, security steps не независимы, Trivy игнорирует unfixed findings, waiver validation слабее документа, а 503 dependency payload не сохраняется global HTTP filter |

---

## 35. `READINESS_AND_SECURITY_GATES.md`

**Статус:** ⚠️ частично актуален. Документ правильно описывает intended liveness/readiness split и существующий security toolchain, но формулировки про blocking/enforcement и фактический HTTP failure contract сильнее текущей реализации.

### Проверено

- `docs/READINESS_AND_SECURITY_GATES.md`;
- current `apps/api/src/modules/health/health.controller.ts`;
- `redis-health.service.ts` и storage readiness через `UploadService.checkReadiness()`;
- `apps/api/src/common/filters/api-exception.filter.ts`;
- `apps/api/src/main.ts`;
- `apps/api/src/config/env.ts`;
- `apps/api/railway.json`;
- current `.github/workflows/ci.yml` и `.github/workflows/codeql.yml`;
- root `package.json`;
- `security-waivers.json` и `scripts/validate-security-waivers.mjs`;
- current `main` branch protection state;
- PR #530 changes, вошедшие в `main` во время аудита.

### Подтверждённые факты

- `GET /api/v1/health/live` действительно не проверяет external dependencies и возвращает `{ status: 'ok' }`.
- `GET /api/v1/health/ready` проверяет PostgreSQL, configured Redis и configured S3-compatible storage; `/api/v1/health` вызывает тот же readiness method как backward-compatible alias.
- Redis и storage возвращают `disabled`, если соответствующая integration не настроена.
- Railway API config действительно использует `/api/v1/health/ready` как deployment healthcheck.
- Production env validation независимо требует Redis, если явно не включён emergency `ALLOW_IN_MEMORY_RATE_LIMIT=true`; storage при этом остаётся optional/config-driven integration.
- Health controller использует `Promise.allSettled`, поэтому dependency failures агрегируются без раскрытия upstream error strings на уровне raw controller exception payload.
- CI запускается на `pull_request` и `push` в `main`.
- Current CI содержит Gitleaks, `pnpm audit --audit-level high`, security-waiver validation, lint, typecheck, tests, migrations/integration tests, build, browser E2E, accessibility, visual checks, Docker builds и Trivy scans обоих production images.
- CodeQL — отдельный workflow на PR/push в `main`, language `javascript-typescript`, queries `security-extended`.
- `security-waivers.json` существует и сейчас содержит пустой `waivers` array.
- `pnpm security:waivers` вызывает `scripts/validate-security-waivers.mjs`.
- Validator требует version 1, array `waivers`, непустые `id/owner/reason/expires`, unique IDs, `YYYY-MM-DD`-подобный expiry и non-expired lexical date; затем генерирует Trivy ignore file из waiver IDs.
- CI сначала валидирует waiver policy и генерирует temporary ignore file, а затем передаёт его обоим Trivy scans.

### Несоответствия и риски

1. **`Blocking security checks` не являются GitHub-enforced merge gates.** Current `main` имеет `protected: false`, required-status-check enforcement `off`, contexts/checks пусты. Workflows могут fail, но GitHub branch protection сейчас не блокирует merge по `CI / Checks` и `CodeQL / Analyze`.

2. **Сам документ частично признаёт это, но текущий wording всё равно двусмыслен.** Строка `Required-check enforcement remains a repository branch-protection setting` верна, однако рядом section title и `Every pull request runs these independent gates` легко читаются как фактически enforced merge policy. Нужно явно показывать current state: `checks configured; merge enforcement currently off`.

3. **Security gates не являются независимыми GitHub jobs.** Gitleaks, dependency audit, waiver validation и Trivy — steps одного job `CI / Checks`. CodeQL — отдельный job/workflow. Если ранний CI step упал, более поздний Trivy scan может не выполниться вообще. Поэтому `independent gates` неверно описывает execution topology.

4. **Trivy не блокирует все HIGH/CRITICAL findings.** Оба scan command используют `--severity HIGH,CRITICAL` и `--exit-code 1`, но одновременно `--ignore-unfixed`. Следовательно, HIGH/CRITICAL vulnerability без available fix не приводит к blocking exit по current command. Документ должен явно это назвать.

5. **Waiver system относится именно к Trivy ignore file, не ко всем security checks.** `pnpm audit`, Gitleaks и CodeQL не читают `security-waivers.json`. Current wording `Security waivers live in...` может восприниматься как общий waiver mechanism; фактически repository script генерирует только Trivy ignore IDs.

6. **Validator не проверяет `id` как `CVE-YYYY-NNNN`.** JSON example создаёт такое впечатление, но code требует только non-empty string + uniqueness. Arbitrary ID формально допустим.

7. **Claim `malformed dates` сильнее реализации.** Validator проверяет только regex `^\d{4}-\d{2}-\d{2}$` и lexical comparison с today. Он не валидирует календарную дату; например syntactically matching future-like `2026-99-99` не будет отвергнута этим кодом как invalid calendar date.

8. **`Extensions require ... recording the review rationale in the pull request` — manual policy, не machine-enforced gate.** Validator не может проверить наличие PR rationale; он проверяет только waiver JSON fields/date/uniqueness.

9. **Raw health controller действительно строит dependency-status body при failure, но global HTTP filter его не сохраняет как описано.** `HealthController` бросает `ServiceUnavailableException({ status: 'error', db, redis, storage })`. Однако globally registered `ApiExceptionFilter` сохраняет custom payload только если `response.error` имеет canonical `{ code, message }` shape. Health payload такого `error` object не содержит, поэтому dependency fields не попадают в normalized API error response.

10. **Существующий health unit test не проверяет этот HTTP boundary.** Test вызывает `controller.getReadiness()` напрямую и инспектирует `ServiceUnavailableException.getResponse()`, то есть подтверждает raw exception payload и отсутствие secret strings, но не проходит через global `ApiExceptionFilter`. Документированное HTTP response contract поэтому не покрыто integration/controller HTTP test.

11. **Из-за global filter формулировка `503 with only a dependency status` сейчас неточна.** На реальном Nest app boundary 503 нормализуется в canonical API error envelope; dependency-status fields теряются. Это одновременно documentation drift и потенциальный implementation gap, если operators должны видеть `db/redis/storage = unavailable` без secret details.

12. **Storage `disabled` semantics могут быть неожиданны для readiness gate.** Документ говорит, что readiness проверяет each configured S3 service — это верно. Но storage не обязателен production env schema, поэтому instance может быть `ready` с `storage: disabled`. Если production readiness policy требует uploads как mandatory capability, это должно быть отдельным product/environment gate, а не inferred из `/ready`.

13. **Redis emergency fallback создаёт аналогичную distinction.** Production может стартовать без Redis только с explicit `ALLOW_IN_MEMORY_RATE_LIMIT=true`; readiness тогда возвращает `redis: disabled`, хотя security topology degraded. Health endpoint показывает technical readiness, а не полный security-readiness verdict.

14. **Branch protection requirement naming следует сверить с фактическими check names.** Current jobs отображаются как `CI / Checks` и `CodeQL / Analyze`; документ называет именно их, что корректно, но пока protection выключена это только desired configuration, не current gate.

15. **PR #530 не меняет выводы по readiness/security gates.** Он добавил course-material delete/reassign endpoints/tests и обновил RBAC/entity docs; health, CI, CodeQL, waiver policy и branch protection им не изменены.

### Что изменить

1. Переименовать section в `Security checks configured for every PR` и отдельно показать `Merge enforcement: OFF` до включения branch protection/ruleset.
2. Если политика требует реального blocking merge gate — включить branch protection/ruleset для `main` с required `CI / Checks` и `CodeQL / Analyze`; это отдельное repository-setting действие.
3. Заменить `independent gates` на фактическую topology: one sequential CI job + separate CodeQL job. Если нужна независимая гарантия выполнения security scans даже при lint/test failure, разделить security scans на отдельные jobs.
4. Явно документировать Trivy `--ignore-unfixed`: blocking applies only to matching fixed/actionable HIGH/CRITICAL findings after waiver ignore list.
5. Уточнить scope waiver policy: `security-waivers.json` currently feeds Trivy ignore only; audit/Gitleaks/CodeQL have no matching waiver mechanism.
6. Либо реально валидировать CVE/GHSA/approved ID format, либо убрать из docs implication, что `id` обязан быть CVE-like.
7. Заменить regex-only date validation на strict calendar-date validation либо ослабить wording `malformed date`; добавить tests на impossible dates.
8. Mark PR rationale/extension review как manual governance requirement, not machine-enforced validation.
9. Решить health failure contract:
   - если dependency statuses нужны операторам, дать `ApiExceptionFilter` canonical safe details либо отдельный health exception path и добавить HTTP integration test;
   - если canonical generic 503 намерен, обновить документ и не обещать dependency-status body.
10. Добавить real HTTP tests для `/health/live`, `/health/ready`, `/health` через globally configured filter, включая failing DB/Redis/storage cases и secret non-leakage.
11. Явно разделить `technical readiness` и `production/security readiness`: `storage: disabled` и emergency `redis: disabled` могут технически дать 200, но не обязательно означают production policy compliance.
12. Добавить `Verified at`, `Verified against main SHA` и current branch-protection state в документ.

### [НЕ ПРОВЕРЕНО]

- Реальный GitHub organization/repository ruleset вне branch endpoint не обнаруживался отдельным organization-level API; проверенный branch state показывает protection disabled.
- Trivy/Gitleaks/CodeQL не запускались вручную в рамках документационного шага; проверяются current workflow commands и subsequent GitHub Actions run audit branch.
- Live Railway behavior при readiness 503/disabled dependencies не проверялся provider API.
- Реальный HTTP health failure response не вызывался live; вывод о потере dependency fields основан на прямом чтении `HealthController` + globally registered `ApiExceptionFilter`. Existing unit test global filter boundary не покрывает.
- External Sentry/security alert routing не относится к этому документу и не проверялся.

### Итог

`READINESS_AND_SECURITY_GATES.md` хорошо фиксирует intended architecture: separate liveness/readiness, dependency-safe checks, PR security tooling и expiring waiver idea. Но как **gate policy** он сейчас переоценивает enforcement. `main` не защищён, security scans в основном последовательные steps одного CI job, Trivy игнорирует unfixed findings, waiver validator слабее заявленного contract, а health 503 dependency status не переживает global API error normalization. После reconciliation документ должен чётко различать: configured check, executed check, machine-enforced merge gate, technical readiness и production/security policy compliance.
