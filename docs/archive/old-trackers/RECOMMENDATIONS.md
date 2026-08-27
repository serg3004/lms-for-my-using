# Recommendations

> **Статус:** `CURRENT`
>
> **Назначение:** хранить только актуальные рекомендации, отделяя уже реализованные части от реально открытой работы и product decisions.
>
> **Проверено по `main`:** `35e0a7df530a894585b29ebd985273d36a63f666` (2026-08-09).

## Статусы

- `DONE` — рекомендация реализована в current repository.
- `PARTIAL` — часть реализована, часть остаётся open.
- `OPEN` — подтверждённый gap.
- `OWNER-DECISION` — реализация зависит от product/business decision.
- `DEFERRED` — не current priority.

---

## R1 — Dependency/security automation

**Статус:** `PARTIAL`

### Уже сделано

- `pnpm audit --audit-level high` запускается в CI.
- Gitleaks запускается в CI.
- Dependabot настроен.
- Security waiver validation существует.

### Остаётся

- сверить Dependabot directories/grouping со всеми workspace roots, особенно `apps/e2e` и `packages/shared`;
- не добавлять auto-merge dependency PR;
- не отключать audit ради unrelated PR.

Historical идея отдельного `Security audit fixer` workflow не является current requirement.

---

## R2 — «Мои курсы» learner experience

### R2.1 — Категория курса

**Статус:** `PARTIAL`

Backend/schema/type contract для category уже существует.

Открытая часть — learner-facing presentation/filtering, если это всё ещё требуется продуктом.

**Правило:** не добавлять новую Prisma category field повторно.

### R2.2 — Точный progress курса

**Статус:** `OPEN`

Learner course cards не должны выводить прогресс только как 0/100 по lifecycle state, если product expectation — реальный процент завершённых lessons.

Backend уже имеет course-completion logic, поэтому новое решение должно переиспользовать существующий источник там, где contract это позволяет.

Acceptance direction:

- определить канонические `lessonsCompleted` / `lessonsTotal` либо эквивалентный completion contract;
- показать реальный percentage;
- покрыть tests.

### R2.3 — Следующий урок

**Статус:** `OPEN`

Canonical `nextLesson` field/UX не подтверждён.

Если feature требуется:

- выбрать первый незавершённый lesson по deterministic order;
- вернуть минимальный summary;
- добавить frontend use + tests.

Если feature не требуется для current MVP, оформить `DEFERRED`, а не оставлять как молчаливую implementation обязанность.

---

## R3 — Сообщение от менеджера

**Статус:** `OWNER-DECISION`

Historical prototype показывал кнопку сообщения, но current repository не содержит согласованного messaging domain/module.

Нельзя автономно выбирать между:

- email notification;
- in-app messaging;
- Notifications feature;
- удалением/неиспользованием этой prototype capability.

До product decision ИИ-агент `MUST NOT` добавлять Message model/API/UI только на основании prototype.

---

## R4 — Responsive visual tests: refresh isolation

**Статус:** `OPEN`

Guest visual test mock покрывает auth/me scenarios, но refresh request должен быть явно изолирован, чтобы browser test не зависел от реального API и не создавал proxy/`ECONNREFUSED` noise.

Required outcome:

- mock `/api/v1/auth/refresh` в guest visual fixture;
- возвращать ожидаемый guest/unauthenticated outcome;
- сохранить production auth code без изменений;
- проверить visual suite.

---

## Что больше не является рекомендацией «с нуля»

Следующие capability нельзя описывать как отсутствующие:

- dependency audit;
- Gitleaks;
- Dependabot baseline;
- course category backend/type support;
- backend course completion logic;
- refresh/session implementation.

Если новая задача утверждает обратное, сначала нужно показать current evidence regression.

---

## Правила для ИИ-агента

1. `MUST` проверять current code/config перед выполнением recommendation.
2. `MUST NOT` повторно реализовывать уже существующий schema/API capability.
3. `OWNER-DECISION` нельзя закрывать без владельца.
4. Recommendation должна стать `DONE`, `DEFERRED` или быть удалена из active section после реализации/отказа.
5. Implementation PR должен обновить этот документ, если закрывает R2/R4 или меняет статус R1/R3.

## Связанные документы

- `docs/PRODUCTION_HARDENING_BACKLOG.md`
- `docs/TODO_VERIFY.md`
- `docs/MVP_SCOPE_LOCK.md`
