# Readiness and Security Gates

> **Статус:** `CURRENT`
>
> **Назначение:** описать фактические runtime readiness checks и security checks репозитория без смешивания четырёх разных уровней: `CONFIGURED`, `EXECUTED`, `MERGE-ENFORCED`, `LIVE-VERIFIED`.
>
> **Проверено по `main`:** `4f4ae9fc941ec52b51aaeffef994162d256dd8fa` (2026-08-10).

## 1. Термины

- `CONFIGURED` — check или health probe определён в code/config.
- `EXECUTED` — check реально запускается текущим GitHub Actions workflow.
- `MERGE-ENFORCED` — GitHub branch protection/ruleset делает check обязательным перед merge.
- `LIVE-VERIFIED` — external runtime/provider state подтверждён свежим deployment/smoke evidence.
- `NOT-ENFORCED` — check существует, но repository settings не блокируют merge при его отсутствии/провале.
- `LIVE-VERIFY` — repository сам по себе не доказывает фактическое production состояние.

**Правило для ИИ-агента:** `MUST NOT` называть check «blocking gate», если подтверждено только `CONFIGURED`/`EXECUTED`, но не `MERGE-ENFORCED`.

---

## 2. Runtime health/readiness

### `/api/v1/health/live`

**Статус:** `IMPLEMENTED`

Liveness endpoint не проверяет внешние зависимости и предназначен для ответа на вопрос «процесс API жив».

### `/api/v1/health/ready`

**Статус:** `IMPLEMENTED`

Readiness проверяет:

- database;
- Redis, если Redis configured;
- S3-compatible storage, если storage configured.

`apps/api/railway.json` использует `/api/v1/health/ready` как Railway healthcheck path.

### `/api/v1/health`

**Статус:** `IMPLEMENTED`

Current controller использует тот же readiness path/logic как compatibility alias.

### Disabled dependencies

Redis/storage могут иметь status `disabled`, если соответствующая dependency намеренно не configured. Это может позволить technical readiness оставаться green.

**Важно:** technical readiness `200` не равен production/security compliance. Например `storage: disabled` подтверждает только то, что API не считает storage обязательным для текущей конфигурации; это не доказывает, что upload capability production-ready.

---

## 3. Health readiness 503 HTTP contract

**Статус:** `IMPLEMENTED`

При failed dependency `HealthController` формирует `ServiceUnavailableException` сразу в canonical API error shape. Глобальный `ApiExceptionFilter` сохраняет этот payload на public HTTP boundary.

Гарантированный HTTP contract для `/api/v1/health/ready` и compatibility `/api/v1/health`:

- HTTP status `503`;
- `error.code = HEALTH_CHECK_FAILED`;
- `error.message = Readiness check failed`;
- `error.details` содержит безопасные dependency statuses для `db`, `redis`, `storage` с `code = DEPENDENCY_STATUS`;
- внутренние сообщения ошибок dependency не включаются в public response.

HTTP-level integration test проходит через global exception filter и проверяет оба readiness endpoint. `/api/v1/health/live` остаётся независимым от состояния dependencies.

**Правило для ИИ:** dependency statuses в readiness `503` можно документировать как public HTTP contract только в canonical `error.details`; сырые internal exception messages `MUST NOT` считаться частью контракта.

---

## 4. CI security checks

### Current `CI / Checks` job

**Статус:** `CONFIGURED` + `EXECUTED`

Current CI workflow выполняет в одном последовательном job, среди прочего:

- Gitleaks secret scan;
- `pnpm audit --audit-level high`;
- security-waiver validation;
- lint;
- typecheck;
- tests;
- migrations/integration/build/browser checks;
- Docker builds;
- Trivy image scans.

Это **один job с последовательными steps**, а не набор независимых GitHub required checks. Если ранний step падает, более поздние steps этого job могут не выполниться.

### CodeQL

**Статус:** `CONFIGURED` + `EXECUTED`

CodeQL находится в отдельном `.github/workflows/codeql.yml` и анализирует `javascript-typescript` с `security-extended` queries.

### Semgrep

**Статус:** `NOT-CONFIGURED`

Отдельного Semgrep workflow в текущем `.github/workflows/` нет.

---

## 5. Trivy semantics

**Статус:** `CONFIGURED` + `EXECUTED`

Current Trivy command использует:

- `--severity HIGH,CRITICAL`;
- `--exit-code 1`;
- `--ignore-unfixed`;
- generated ignorefile from security waivers.

Следовательно:

- fixed/processable HIGH/CRITICAL findings могут сделать scan red;
- unfixed HIGH/CRITICAL findings исключаются из blocking result из-за `--ignore-unfixed`;
- утверждение «любая HIGH/CRITICAL vulnerability блокирует CI» неверно.

**Правило для ИИ:** всегда учитывать `--ignore-unfixed` при описании security gate.

---

## 6. Security waivers

### Source

**Статус:** `IMPLEMENTED`

`security-waivers.json` — repository-controlled список waivers. На момент проверки массив waivers пуст.

### Validator

`validate-security-waivers.mjs` проверяет:

- `version === 1`;
- `waivers` — array;
- non-empty `id`, `owner`, `reason`, `expires`;
- uniqueness `id`;
- syntactic date pattern `YYYY-MM-DD`;
- lexical non-expiry against current ISO date.

Validator **не подтверждает**:

- что `id` имеет CVE format;
- что дата является реальной календарной датой (например month/day range semantic validation отсутствует);
- что PR содержит human rationale/approval beyond file contents.

Generated waiver IDs используются для Trivy ignorefile. Этот механизм не является waiver для Gitleaks, `pnpm audit` или CodeQL.

**Правило для ИИ:** `MUST NOT` писать, что security waiver автоматически исключает finding из всех security tools.

---

## 7. Merge enforcement

**Статус:** `MERGE-ENFORCED`

**Подтверждено владельцем (2026-08-26):** ruleset `Protect main` активен на GitHub
(Rulesets → Protect main → Active), применяется к `main`. `main` защищена:
deletion и force-push запрещены, pull request обязателен (0 required approvals),
required status checks — ровно `Checks` и `Analyze (javascript-typescript)` —
должны быть green, `Require branches to be up to date before merging` включено.

Следовательно merge в `main` технически невозможен без green required checks.

Единственное отклонение от исходной policy-as-code (`scripts/configure-branch-protection.mjs`):
`Require conversation resolution before merging` выключен осознанным решением владельца.
Это не влияет на merge enforcement CI/CodeQL — только снимает требование закрывать все
review-треды перед merge.

Подробности и история решения: `docs/DEVELOPMENT_PLAN.md`, PR 129 / PR 238.

---

## 8. Production readiness vs repository readiness

Следующие вещи имеют статус `LIVE-VERIFY`:

- фактический Redis availability;
- фактический S3-compatible provider/bucket/CORS;
- malware scanner availability;
- Railway environment/service topology;
- alert routing/Sentry delivery;
- backup/PITR/restore readiness;
- fresh production smoke.

Repository code/config доказывает intended/implemented behavior, но не current production state.

---

## 9. Release interpretation

Для release/go-no-go нужно различать:

1. `CONFIGURED` — check/probe существует;
2. `EXECUTED` — check реально запущен на relevant SHA;
3. `PASSED` — relevant run green;
4. `MERGE-ENFORCED` — repository settings не позволяют обойти check;
5. `LIVE-VERIFIED` — external runtime state подтверждён fresh evidence.

Один уровень не подразумевает автоматически следующий.

---

## 10. Правила для ИИ-агента

1. `MUST` указывать, о каком уровне gate идёт речь.
2. `MUST NOT` называть `main` protected/required-check-enforced без fresh repository-setting evidence.
3. `MUST` описывать readiness dependency statuses только в canonical 503 `error.details` contract.
4. `MUST` учитывать `--ignore-unfixed` в Trivy semantics.
5. `MUST NOT` распространять Trivy waiver на audit/Gitleaks/CodeQL.
6. `MUST NOT` считать `storage: disabled` или emergency Redis fallback доказательством production compliance.
7. `LIVE-VERIFY` assertions должны иметь fresh external evidence.

## Связанные документы

- `docs/RATE_LIMIT_FAILURE_POLICY.md`
- `docs/CI_AUDIT_BASELINE.md`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/TODO_VERIFY.md`
