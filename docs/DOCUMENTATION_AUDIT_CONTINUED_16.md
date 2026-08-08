# Продолжение аудита актуальности документации — часть 16

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_15.md` содержат результаты №21–35. Этот файл продолжает последовательный аудит с №36.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 36 | `RECOMMENDATIONS.md` | ⚠️ Частично актуален / mixed backlog | R1 частично реализован; R2.1 backend/type часть уже сделана, R2.2/R2.3 остаются; R3 — отдельная новая product feature; R4 всё ещё не выполнен |

---

## 36. `RECOMMENDATIONS.md`

**Статус:** ⚠️ частично актуален. Файл полезен как chronological backlog идей R1–R4, но сейчас смешивает уже реализованные части, остающиеся gaps и рекомендации, которые требуют обновления формулировок под current architecture. Его не следует читать как единый список полностью открытых задач.

### Проверено

- `docs/RECOMMENDATIONS.md` полностью, R1–R4;
- current `.github/dependabot.yml`;
- current `.github/workflows/ci.yml` и workflow inventory;
- current `.github/pull_request_template.md`;
- current `main` branch protection state;
- `apps/api/prisma/schema.prisma`;
- `apps/api/src/modules/courses/courses.service.ts`;
- `apps/web/src/shared/api/types.ts`;
- `apps/web/src/app/LearnerCoursesPage.tsx`;
- `apps/web/src/app/ManagerTeamPage.tsx`;
- `apps/e2e/visual-tests/responsive-matrix.spec.ts`;
- current `README.md`;
- root `AGENTS.md` и `CONTRIBUTING.md` — оба отсутствуют (404);
- CI/CodeQL результата предыдущего audit HEAD №35.

### R1 — CI / Dependabot / pnpm audit

**Статус R1:** ⚠️ частично реализован и частично требует пересмотра.

Подтверждено:

- `pnpm audit --audit-level high` действительно остаётся обязательным step текущего `CI / Checks`; рекомендация не отключать audit соблюдена.
- Dependabot уже включён и работает weekly, с grouped updates для GitHub Actions и npm production/development dependencies.
- Отдельного workflow `Security audit fixer` в `.github/workflows/` нет: текущий inventory — `ci.yml`, `codeql.yml`, `staging-smoke.yml`.
- PR template не содержит предложенного отдельного section `Dependency/audit impact`; есть только общий type checkbox `Security / dependencies` и стандартные check/result sections.
- `main` сейчас `protected: false`, required status checks enforcement `off`; поэтому совет быстро merge green Dependabot PR является process recommendation, а не machine-enforced safety gate.

Несоответствия/уточнения:

1. Формулировка `маленькие и частые Dependabot PR` не соответствует current config буквально: updates weekly и сгруппированы, то есть намеренно уменьшают количество PR ценой более крупных grouped changes.
2. Current Dependabot npm scope всё ещё неполон для workspace: настроены `/`, `/apps/api`, `/apps/web`, но не `/apps/e2e` и `/packages/shared`.
3. Proposed `Security audit fixer` с автоматическим `pnpm audit --fix` нельзя называть безусловно безопасной автоматизацией: он способен менять dependency graph/lockfile. Правильный safety boundary — отдельная branch + reviewed PR + bounded diff + повторный audit/test/CI, без auto-merge.
4. Рекомендация про merge order `GitHub Actions → dev → prod` является governance preference, не repository-enforced dependency policy.

### R2.1 — Категория курса

**Статус R2.1:** ⚠️ backend/schema/type часть уже реализована, UI часть остаётся.

- Исходная проблема `в Prisma нет поля category` уже устарела: current `Course` имеет `category String?`.
- `courseSelect` уже возвращает `category`.
- Web `CourseSummary` уже содержит `category: string | null`.
- Однако `LearnerCoursesPage` category не отображает.
- Category filter на странице присутствует только как disabled placeholder `Все категории` и не фильтрует данные.

Следовательно, шаги 1, 3 и 4 из первоначальной рекомендации фактически выполнены; migration/history шага 2 в этом audit не реконструировалась; шаг 5/UI остаётся открытым.

### R2.2 — Точный процент прогресса курса

**Статус R2.2:** ⚠️ проблема остаётся, но backend уже имеет reusable calculation.

- `LearnerCoursesPage` всё ещё подменяет learner progress lifecycle-статусом курса: `archived → 100%`, иначе `0%`.
- `listCourses()` возвращает обычные course summaries и не агрегирует learner-specific progress.
- Отдельный backend method `getCourseCompletion(courseId, userId, organizationId)` уже считает published lessons, completed lesson progress и точный percentage.
- Поэтому рекомендация остаётся актуальной по product behavior, но реализацию лучше строить на согласованной completion semantics и batch aggregation, а не делать по две count-query на каждый course в списке.

[ВЫВОД] `Course.status === archived` не является корректным proxy пользовательского completion: это lifecycle курса, а progress — user-specific state. Текущий UI показывает именно этот semantic mismatch, который R2.2 правильно пытается устранить.

### R2.3 — Следующий урок

**Статус R2.3:** ⚠️ остаётся открытым.

- `CourseSummary` не содержит `nextLesson`.
- `listCourses()` не рассчитывает первый незавершённый урок.
- `LearnerCoursesPage` не показывает `nextLesson`.

При реализации нужно использовать ту же eligibility/completion semantics, что и R2.2: published, non-deleted lessons, learner-specific completed progress и deterministic `order`. Иначе progress percentage и “следующий урок” могут расходиться между собой.

### R3 — Сообщения менеджера

**Статус R3:** ⚠️ всё ещё отдельная новая feature, а не maintenance fix.

- В current Prisma schema модели `Message` нет.
- Отдельного messages backend module/API в проверенном current module surface нет.
- `ManagerTeamPage` показывает поиск, фильтр и таблицу команды; action “Написать команде” отсутствует.
- Значит исходная формулировка проблемы остаётся актуальной.

При этом рекомендация сама правильно помечает R3 как отдельную задачу. Перед реализацией нужен product decision: email, in-app messages или notifications, recipient semantics, retention/audit и связь с уже неоднозначным MVP scope Notifications. Добавлять `Message` model только ради восстановления prototype-кнопки без этого решения не следует.

### R4 — Refresh-запросы в responsive visual tests

**Статус R4:** ⚠️ рекомендация по-прежнему не реализована.

- `installGuestMock()` в `apps/e2e/visual-tests/responsive-matrix.spec.ts` перехватывает только `**/api/v1/auth/me` и возвращает 401.
- Mock для `**/api/v1/auth/refresh` отсутствует.
- Следовательно, предложенный точечный isolation change из R4 в current test code не выполнен.
- При этом предыдущий audit HEAD №35 прошёл `CI #1317` и `CodeQL #825`; green CI не доказывает отсутствие proxy noise в log и не заменяет explicit route isolation.

### Что изменить в `RECOMMENDATIONS.md`

1. Превратить R1–R4 из prose-only notes в таблицу со статусами `Done / Partial / Open / Needs product decision` и `Verified against main SHA`.
2. R1:
   - отметить `pnpm audit` и Dependabot как реализованные;
   - отметить fixer workflow и PR-template section как не реализованные;
   - синхронизировать wording с weekly grouped Dependabot policy;
   - добавить `/apps/e2e` и `/packages/shared` в отдельную dependency-automation remediation задачу;
   - не обещать безопасный merge process до включения branch protection/required checks.
3. R2.1:
   - зачеркнуть/заменить утверждение, что `category` отсутствует в Prisma;
   - отметить schema/select/type как Done;
   - оставить learner badge/filter UI как Open.
4. R2.2:
   - оставить задачу Open;
   - ссылаться на уже существующий `getCourseCompletion()` как canonical completion semantics;
   - проектировать batch/list projection, чтобы избежать N+1 queries;
   - удалить progress derivation из `Course.status` на Web.
5. R2.3:
   - оставить Open;
   - определить `nextLesson` через те же published/non-deleted/completed semantics, что и completion percentage.
6. R3:
   - пометить `Needs product decision`;
   - связать с MVP Notifications decision до изменения Prisma/API/UI;
   - определить delivery channel, recipient model, retention и audit requirements.
7. R4:
   - оставить Open и добавить точный acceptance test: guest visual mock перехватывает `/auth/me` и `/auth/refresh`, никакого реального API request, production auth code не меняется.
8. Добавить freshness header и не использовать старые problem statements как current facts после частичной реализации.

### [НЕ ПРОВЕРЕНО]

- Не реконструирован migration/PR, которым `Course.category` был добавлен; проверено только его наличие в current Prisma schema/current API/type surface.
- Не проверялся фактический текущий CI log visual job на наличие `ECONNREFUSED`/`http proxy error`; подтверждено только отсутствие refresh mock в test code. Поэтому конкретный шум в latest run остаётся `[НЕ ПРОВЕРЕНО]`.
- Не подтверждено наличие email provider/infrastructure для R3; password-reset delivery по текущему проекту остаётся skeleton, поэтому channel choice требует отдельного решения.
- Proposed `Security audit fixer` не запускался и его behavior не моделировался на current lockfile; оценка риска `pnpm audit --fix` основана на том, что workflow намеренно будет менять dependency graph и должен оставаться review-bound.
- Не измерялась query-performance предлагаемой batch progress реализации; N+1 warning — архитектурный риск, а не benchmark result.

### Итог

`RECOMMENDATIONS.md` не устарел целиком, но больше не является списком “что ещё надо сделать”. R1 уже частично поглощён CI/Dependabot, R2.1 наполовину завершён backend/type изменениями, R2.2 и R2.3 остаются реальными learner UX gaps, R3 всё ещё требует отдельного product decision, а R4 остаётся точечной незакрытой test-isolation задачей. Документ стоит сохранить как decision/recommendation log, но добавить per-item status и SHA-bound verification, чтобы частично реализованные problem statements не продолжали выглядеть как current facts.
