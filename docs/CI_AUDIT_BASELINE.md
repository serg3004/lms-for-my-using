# CI Audit Baseline

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать фактический состав CI/security automation и отдельно показать, что configured/executed checks не равны merge-enforced policy.
>
> **Проверено по `main`:** `4585e8b641b65484a6a29d2383d46f259a3e1e15` (2026-08-09).

## 1. Термины

- `CONFIGURED` — workflow/check определён в repository.
- `EXECUTED` — workflow запускается для соответствующего trigger.
- `PASSED` — конкретный run на конкретном SHA завершился success.
- `MERGE-ENFORCED` — GitHub branch protection/ruleset требует check перед merge.
- `NOT-CONFIGURED` — соответствующего automation в repository нет.
- `LIVE-VERIFY` — external state нельзя подтвердить только code/config.

**Правило:** не использовать слово `blocking` без подтверждения `MERGE-ENFORCED`.

---

## 2. Workflow inventory

Current `.github/workflows/` содержит:

- `ci.yml` — основной CI pipeline;
- `codeql.yml` — CodeQL analysis;
- `staging-smoke.yml` — manual/environment smoke workflow.

Отдельного Semgrep workflow нет.

---

## 3. Main CI topology

### Workflow: CI

**Статус:** `CONFIGURED` + `EXECUTED`

Основная проверка организована как один job `Checks`, содержащий последовательные steps.

В него входят, в частности:

1. checkout/setup;
2. secret scanning (Gitleaks);
3. dependency audit (`pnpm audit --audit-level high`);
4. security waiver validation;
5. install/generation;
6. lint;
7. typecheck;
8. unit/application tests;
9. staging smoke script tests;
10. PostgreSQL migrations/integration checks;
11. build;
12. browser E2E;
13. accessibility baseline;
14. responsive visual matrix;
15. API/Web Docker builds;
16. Trivy scans generated images.

**Важно:** это не 16 независимых GitHub required checks. Это последовательные steps одного CI job. Если ранний step падает, более поздний step может не выполниться.

---

## 4. Secret scanning

### Gitleaks

**Статус:** `CONFIGURED` + `EXECUTED`

Gitleaks запускается в основном CI job.

Repository automation подтверждает наличие scan, но не даёт основания утверждать, что branch merge технически невозможен при failed/missing CI, пока required checks не включены repository settings.

---

## 5. Dependency audit

### pnpm audit

**Статус:** `CONFIGURED` + `EXECUTED`

CI выполняет:

`pnpm audit --audit-level high`

Это отдельный step основного `CI / Checks` job.

Security waiver mechanism ниже не является waiver для `pnpm audit`.

---

## 6. Security waiver validation

**Статус:** `CONFIGURED` + `EXECUTED`

Source file: `security-waivers.json`.

Current validator проверяет:

- version 1;
- array shape;
- non-empty `id`, `owner`, `reason`, `expires`;
- unique IDs;
- `YYYY-MM-DD` regex;
- lexical expiry relative to current ISO date.

Current `security-waivers.json` содержит пустой `waivers` array.

### Ограничения validator

Он не валидирует:

- CVE identifier semantics/format;
- календарную корректность date beyond regex;
- наличие reviewer approval;
- наличие отдельного PR rationale field.

Generated IDs используются для Trivy ignorefile.

**Важно:** waiver не распространяется автоматически на Gitleaks, dependency audit или CodeQL.

---

## 7. Lint / typecheck / tests / build

**Статус:** `CONFIGURED` + `EXECUTED`

Current CI включает:

- lint;
- Prisma client generation;
- typecheck;
- tests;
- database migration replay;
- API database integration tests;
- build.

Это подтверждает repository CI baseline, но не live production behavior.

---

## 8. Browser quality checks

**Статус:** `CONFIGURED` + `EXECUTED`

CI содержит:

- browser E2E;
- accessibility baseline;
- responsive visual matrix.

Эти проверки являются steps текущего CI pipeline; их результаты нужно связывать с конкретным workflow run/SHA.

---

## 9. Container security

### Docker builds

**Статус:** `CONFIGURED` + `EXECUTED`

CI собирает API и Web Docker images.

### Trivy

**Статус:** `CONFIGURED` + `EXECUTED`

Current Trivy invocation использует:

- `--severity HIGH,CRITICAL`;
- `--exit-code 1`;
- `--ignore-unfixed`;
- generated ignorefile from `security-waivers.json`.

Следовательно unfixed HIGH/CRITICAL vulnerabilities не входят в blocking result.

**Правило для ИИ:** формулировка «HIGH/CRITICAL всегда блокируют CI» неверна; нужно указывать `--ignore-unfixed`.

---

## 10. CodeQL

**Статус:** `CONFIGURED` + `EXECUTED`

`codeql.yml` является отдельным workflow и анализирует `javascript-typescript` с `security-extended` queries.

CodeQL не использует Trivy waiver file как bypass mechanism.

---

## 11. Semgrep

**Статус:** `NOT-CONFIGURED`

Отдельный Semgrep workflow/check в current `.github/workflows/` отсутствует.

Не следует указывать Semgrep как часть текущего CI baseline, пока automation не добавлен.

---

## 12. Branch protection / merge enforcement

**Статус:** `NOT-ENFORCED`

На момент проверки GitHub `main`:

- `protected: false`;
- required status checks enforcement выключен.

Это означает:

- CI/CodeQL можно запускать и получать green/red results;
- repository settings не гарантируют обязательность green result для merge.

**Правило для ИИ:** `EXECUTED/PASSED` и `MERGE-ENFORCED` — разные факты.

Branch protection/ruleset должен проверяться заново перед любым утверждением, что checks стали required.

---

## 13. Staging smoke workflow

**Статус:** `CONFIGURED`; live target — `LIVE-VERIFY`.

`staging-smoke.yml` существует как GitHub Actions workflow и использует staging-labeled variables/secrets/environment configuration.

Его наличие не доказывает существование отдельного Railway staging environment. Current canonical docs отдельно фиксируют, что repository policy не предполагает отдельный Railway staging environment без owner/ops decision.

---

## 14. Что CI baseline не доказывает

Даже полностью green CI не является доказательством:

- current Railway production topology;
- live Redis/storage/scanner availability;
- backup/PITR configuration;
- production smoke result;
- alert routing/Sentry delivery;
- branch protection, если settings не проверены отдельно.

Эти утверждения имеют статус `LIVE-VERIFY` или требуют repository-setting evidence.

---

## 15. Rules for humans and AI agents

1. Указывать конкретный workflow/run/SHA, если заявляется `PASSED`.
2. `MUST NOT` превращать CI step в «independent gate», если это step одного job.
3. `MUST NOT` утверждать merge blocking без branch protection/ruleset evidence.
4. `MUST` указывать `--ignore-unfixed` при описании Trivy.
5. `MUST NOT` распространять Trivy waiver на другие security tools.
6. `MUST NOT` включать Semgrep в current baseline без workflow.
7. `MUST NOT` считать staging-named GitHub environment доказательством отдельного Railway staging.
8. Live infrastructure assertions всегда требуют fresh external evidence.

## Связанные документы

- `docs/READINESS_AND_SECURITY_GATES.md`
- `docs/RATE_LIMIT_FAILURE_POLICY.md`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/TODO_VERIFY.md`
