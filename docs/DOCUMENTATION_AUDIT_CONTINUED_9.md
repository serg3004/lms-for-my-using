# Продолжение аудита актуальности документации — часть 9

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_8.md` содержат результаты №21–28. Этот файл продолжает тот же последовательный аудит с №29.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 29 | `PROJECT_LOG.md` | ⚠️ Retired historical record с misleading metadata | Retirement корректен, но successor `DEVELOPMENT_PLAN.md` больше не является текущим changelog; `PR N` внутри log не совпадает с GitHub PR numbering, а исторические `Current`/`Deferred` заголовки могут читаться как current state |

---

## 29. `PROJECT_LOG.md`

**Статус:** ⚠️ корректно retired как historical record, но retirement metadata и идентификация `PR N` требуют исправления. Само старое содержимое не нужно переписывать под текущий код; проблема — в том, как документ объясняет свою историю и куда отправляет читателя за текущим changelog/status.

### Проверено

- полный `docs/PROJECT_LOG.md`;
- current `README.md` и его MVP docs section;
- current `PILOT_CHECKLIST.md` documentation section;
- current `PROJECT_SOURCE_OF_TRUTH.md` hierarchy;
- Git history для `docs/DEVELOPMENT_PLAN.md`;
- реальные GitHub PR #20, #21, #22, #23 и #39 как выборка для проверки значения внутреннего `PR N`;
- current `AuthController` для проверки, что historical `Deferred` auth items нельзя трактовать как нынешний статус;
- current `main` после PR #525.

### Подтверждённые факты

- `PROJECT_LOG.md` имеет явный retirement banner от 2026-08-06: log остановлен и новые записи должны идти не сюда.
- Файл содержит исторические записи конца мая 2026 и действительно не пытается продолжать текущие изменения после retirement banner.
- `README.md` и `PILOT_CHECKLIST.md` повторяют retirement `PROJECT_LOG.md` и указывают `DEVELOPMENT_PLAN.md` как его replacement/project changelog.
- `PROJECT_SOURCE_OF_TRUTH.md` не ставит `PROJECT_LOG.md` в текущую иерархию source-of-truth; при конфликте current decisions должны идти через current code/docs и higher-priority artifacts.
- Последний commit, затронувший `docs/DEVELOPMENT_PLAN.md`, — `88b23cf3e1f7f46ee7a2f5ecf72f7db3deade519` от 2026-08-03 (`test(web): complete frontend coverage stage one`). Текущий `main` на момент аудита — `a3fa777f0d9cb57e0daded474ad1028ee35c59e7`, merge PR #525 от 2026-08-08. Значит `DEVELOPMENT_PLAN.md` не записывает каждый последующий PR и не является непрерывным current changelog в буквальном смысле retirement banner.
- Нумерация `PR N` внутри `PROJECT_LOG.md` не совпадает с реальными GitHub PR numbers:
  - log описывает `PR 20` как secure public user/organization creation, а GitHub PR #20 — `ci: add lint and test checks`;
  - log `PR 21` — assessment attempt eligibility/API error contract, а GitHub PR #21 — `docs: sync after tooling updates`;
  - log `PR 22` — workspace registration/login/logout hardening, а GitHub PR #22 — `feat(api): implement organizations API module`;
  - log `PR 23` — admin layout/dashboard, а GitHub PR #23 — `docs: sync api implementation status`;
  - log `PR 39–42` называет auth/session hardening series, тогда как GitHub PR #39 — `feat(api): add assignments API skeleton`.
- Следовательно, `PR N` в историческом log — внутренняя work-item/plan нумерация либо иной локальный идентификатор, но **не GitHub PR #N**. Документ этого не объясняет.
- Historical auth section содержит `Deferred: Refresh token/httpOnly cookie implementation` и `Token revocation/session store`. Current `AuthController` уже имеет `POST /auth/refresh`, использует `AuthSessionStore` и реализует `logout-all` через revocation. Эти строки корректны только как state-at-that-time, а не current backlog.

### Несоответствия и риски

1. **Retirement header неправильно описывает successor.** Формулировка, что `DEVELOPMENT_PLAN.md` — de facto changelog и `every PR's actual implementation is recorded there`, опровергается Git history: файл не обновлялся после 2026-08-03, тогда как main продолжил до PR #525 и далее может продолжать независимо.

2. **`PR 20–42` в banner двусмысленно и фактически не равно GitHub PR #20–42.** Поскольку в той же строке говорится `project is now at PR #505+`, читатель естественно интерпретирует старые номера как GitHub PR. Выборочная проверка GitHub PR #20/#21/#22/#23/#39 показывает систематическое несовпадение.

3. **Исторические headings используют слово `Current`.** `Current auth/session status` и `Current PR check status` внутри archived section могут быть вырваны из контекста и ошибочно приняты за current repository state. После retirement лучше маркировать их `Status at 2026-05-30` / `Checks recorded at the time`.

4. **Historical `Deferred` list выглядит как current backlog, хотя часть пунктов давно реализована.** Refresh/session-store/revocation уже существуют в current auth controller. Это не ошибка исторического snapshot, но документу нужен явный qualifier `Deferred at the time; not current backlog`.

5. **README и PILOT_CHECKLIST наследуют ошибочный successor claim.** Оба current docs называют `DEVELOPMENT_PLAN.md` replacement/project changelog. Поэтому исправить только retirement banner недостаточно: в последующей remediation фазе нужно синхронизировать ссылки во всех трёх местах.

6. **Нет canonical current changelog artifact.** `PROJECT_SOURCE_OF_TRUTH.md` задаёт hierarchy решений и current scope, но не является chronological changelog. Git commits/merged PR history сейчас фактически являются наиболее полным chronological record после 2026-08-03; если нужен human-maintained changelog, его следует определить отдельно.

7. **Historical entry accuracy не доказана для всего диапазона 20–42.** Выборка уже доказывает проблему идентификаторов, но полный forensic reconciliation каждой старой work item с branch/commit/actual GitHub PR не нужен для current documentation usability, если документ будет явно назван internal work-item log.

### Что изменить

1. Сохранить `PROJECT_LOG.md` как immutable/retired historical artifact; не переписывать старые implementation details под current code.
2. Исправить retirement banner:
   - заменить `PR 20–42` на `internal work items / plan items 20–42`, если это действительно их происхождение;
   - не использовать `PR #` для internal plan numbering;
   - явно написать, что это **не GitHub PR numbering**.
3. Удалить абсолютное утверждение, что `DEVELOPMENT_PLAN.md` записывает каждый PR. Более точный successor contract: current decisions/status — `PROJECT_SOURCE_OF_TRUTH.md`, `MVP_SCOPE_LOCK.md`, relevant current docs + code; chronological change history — GitHub merged PRs/commits, пока отдельный maintained changelog не создан.
4. В исторической части переименовать `Current auth/session status` → `Auth/session status at 2026-05-30`, `Current PR check status` → `Checks recorded at the time`.
5. Перед `Deferred` добавить `Historical — deferred at the time; not the current backlog`.
6. Синхронизировать retirement wording в `README.md` и `PILOT_CHECKLIST.md`; они сейчас повторяют неверный claim про `DEVELOPMENT_PLAN.md` как current project changelog.
7. Если проект хочет human-readable chronological changelog, создать отдельный `CHANGELOG.md` или automation/generated release notes и определить его maintenance contract. Не смешивать roadmap/work-item ledger с GitHub PR history.
8. При необходимости исторической точности отдельной задачей построить mapping `internal work item → branch/commit → actual GitHub PR`, но не блокировать на этом текущий retirement cleanup.

### [НЕ ПРОВЕРЕНО]

- Не реконструирован полный mapping всех internal items 20–42 к реальным branches/commits/GitHub PR; проверены #20/#21/#22/#23/#39, чего достаточно для подтверждения systematic numbering mismatch.
- Не доказано из самого файла, откуда именно произошла внутренняя нумерация `PR N` — вероятнее всего plan/work-item numbering, но это нужно подтвердить историческим planning artifact перед финальным rename.
- Все historical implementation claims внутри каждой записи не перепроверялись против checkout соответствующего 2026-05 commit; документ рассматривается как retired snapshot, а не как current runtime spec.
- Отдельного официального `CHANGELOG.md` в текущем root/docs inventory не обнаружено; не проверялись внешние release systems вне GitHub repository.

### Итог

`PROJECT_LOG.md` не нужно возвращать к жизни и дописывать новыми PR. Retirement — правильное решение. Исправить нужно его **метаданные**: старые `PR N` нельзя выдавать за GitHub PR numbers, `DEVELOPMENT_PLAN.md` больше нельзя называть непрерывным changelog, а historical `Current`/`Deferred` sections должны явно привязываться к 2026-05 snapshot. После этого файл станет безопасным архивом, а current chronology следует брать из merged GitHub PR/commit history либо из нового явно поддерживаемого changelog artifact.
