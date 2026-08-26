# Organization Structure — Implementation Plan

**Назначение:** единый исполняемый план работ по реализации модуля организационной структуры в `serg3004/lms-for-my-using`.  
**Диапазон:** PR 266–284.  
**Формат каждого PR:** `PR — название` → `Задача` → `Что необходимо сделать` → `Критерии оценки`.  
**Принцип:** документ должен быть достаточен для последовательной реализации человеком или автономным ИИ-агентом без самостоятельного переизобретения архитектуры.

## Основа плана

План сформирован из полной архитектурной и функциональной спецификации оргструктуры и итоговой декомпозиции работ. Он не заменяет факты текущего кода: перед каждым PR агент обязан заново сверять актуальный `main`, schema, tests, CI и связанные project docs.

## Обязательный архитектурный контракт

Следующие решения считаются частью целевой архитектуры и не должны меняться внутри обычного implementation PR:

- `Department` — отдельный домен и не заменяет существующий `Group`.
- Каноническая иерархия: `Department.parentId` (adjacency list).
- У Department один structural parent; multi-parent structural graph не используется.
- `DepartmentType` — tenant-configurable классификация, а не жёсткая схема уровней.
- Размещение сотрудников: `DepartmentMembership`, не `User.departmentId`.
- Поддерживаются current primary и additional memberships с историей.
- Руководители подразделения: отдельные `DepartmentManager` records.
- Поддерживаются 0..N `DIRECT` и 0..N `FUNCTIONAL` managers.
- Для каждого типа руководителя поддерживаются `LOCAL`, `INHERIT`, `MERGE`.
- `DepartmentManager` не выдаёт пользователю RBAC-role автоматически.
- Персональная матричная линия подчинения моделируется через `ReportingLine`.
- Должность моделируется через `Position`; legacy `User.position` сохраняется до отдельной deprecation.
- Обучение по должности: `PositionCourse`.
- Обучение по подразделению: Department target в Assignment с `includeDescendants`.
- Effective learner eligibility сводится единым `LearningTargetResolver`/эквивалентом.
- Manager data access строится как RBAC + relationship/object scope через `OrganizationScope`.
- Existing legitimate `ManagerGroup` scope сохраняется и сосуществует с Department scope.
- Additional Department membership по умолчанию не даёт headcount, Department training target и manager-readable scope.
- Public hard-delete Department не используется; lifecycle — archive/restore.
- История критических оргизменений сохраняется через `OrgStructureEvent`.
- Tenant isolation проверяется backend и, где возможно, DB constraints.
- Конкурентные структурные операции защищаются DB invariants и `Serializable` transaction/retry.
- Prisma 6 DB-возможности, которых нет в PSL, реализуются custom SQL migration.
- Иерархия сначала работает на recursive CTE; closure table/`ltree` допускаются только после измеримого bottleneck.
- External IDs не заменяют internal UUID; HRIS/SCIM connector не входит в эту серию.
- Production migration/deploy не выполняются без отдельного явного разрешения.

## Правила исполнения для ИИ-агента

1. Перед каждым PR повторно прочитать актуальный `main`, связанные schema/services/controllers/tests/CI/docs.
2. Не считать SHA, номера фактических GitHub PR и runtime status из этого файла вечными фактами.
3. PR 266 является независимым security fix.
4. Перед PR 267+ проверить TV-020/TV-056. Если owner decision всё ещё не закрыт — остановить реализацию PR 267+ и пометить блокировку фактом.
5. Не начинать PR, если его функциональная основа из предыдущих PR ещё не находится в `main`.
6. Не менять целевую архитектуру самовольно. Если текущий код делает запланированное решение невозможным или business outcome неоднозначен — зафиксировать конфликт и запросить owner decision.
7. Каждый PR должен быть атомарным: только код, schema, tests и docs, относящиеся к его задаче.
8. Изменение behavior требует tests. Изменение API/schema/RBAC/migration требует соответствующего обновления документации.
9. Не ослаблять security/tests ради зелёного CI.
10. Не объявлять PR завершённым без проверки всех критериев оценки и доступного CI.
11. После каждого schema PR проверять clean migration и representative upgrade path, если это применимо.
12. После появления реальных данных rollback предпочитает application rollback + сохранение additive schema/data + forward-fix, а не destructive DROP.
13. Если план и текущий код расходятся:
    - текущий код/schema/tests — источник факта о том, что реализовано сейчас;
    - этот план — источник целевого поведения;
    - расхождение должно быть явно устранено или зафиксировано как блокировка.

## Порядок реализации

```text
PR 266
  ↓
PR 267
  ↓
PR 268
  ↓
PR 269
  ↓
PR 270
  ↓
PR 271
  ↓
PR 272
  ↓
PR 273
  ↓
PR 274
  ↓
PR 275
  ↓
PR 276
  ↓
PR 277
  ↓
PR 278
  ↓
PR 279
  ↓
PR 280
  ↓
PR 281
  ↓
PR 282
  ↓
PR 283
  ↓
PR 284
```

---

## PR 266 — Закрыть privilege escalation через ManagerGroup

### Задача

Устранить существующую возможность для пользователя с ролью `manager` самостоятельно расширять manager scope через изменение `ManagerGroup`. Этот PR является независимым security fix и должен быть выполнен до внедрения новой оргструктуры.

### Что необходимо сделать

- Добавить object-level authorization для чтения и изменения:
  - members группы;
  - managers группы.
- Запретить manager:
  - назначать себя manager чужой Group;
  - добавлять/удалять managers Group вне уже разрешённого scope;
  - изменять members чужой Group.
- Сохранить полный tenant-level management для `admin`.
- Все Group lookup выполнять tenant-scoped.
- Сохранить существующий легитимный `ManagerTeamScope`.
- Проверить, что отказ операции не меняет последующий доступ к users, assignments и reports.
- Добавить security regression tests:
  - manager A → Group B;
  - self-assignment;
  - manager mutation;
  - member mutation;
  - foreign tenant;
  - scope после denied mutation.
- Если меняется policy, синхронизировать `roles.ts` и `docs/API_RBAC_MATRIX.md`.
- DB migration не выполнять, если она не требуется фактическим fix.

### Критерии оценки

- [ ] manager не может расширить собственный scope через `ManagerGroup`;
- [ ] подмена Group ID не даёт доступ к чужой Group;
- [ ] manager не может менять members/managers вне разрешённого scope;
- [ ] admin сохраняет корректный Group management;
- [ ] существующие допустимые manager-сценарии не сломаны;
- [ ] cross-tenant доступ закрыт;
- [ ] regression tests покрывают exploit;
- [ ] RBAC-документация соответствует коду;
- [ ] lint/typecheck/tests/build проходят;
- [ ] GitHub CI зелёный.

---

## PR 267 — Зафиксировать scope оргструктуры и разделить Group/Department в продукте

### Задача

Закрыть owner decision по полной оргструктуре и устранить семантическое смешение существующих `Group` с будущими штатными `Department`.

### Что необходимо сделать

- Зафиксировать решение владельца по TV-020/TV-056:
  - рекомендуемый вариант — `POST_MVP_APPROVED`;
  - либо явно изменить MVP scope, если это бизнес-решение владельца.
- Синхронизировать:
  - `docs/TODO_VERIFY.md`;
  - `docs/DEVELOPMENT_PLAN.md`;
  - `docs/MVP_SCOPE_LOCK.md` только если реально меняется MVP scope.
- Перед публикацией серии повторно проверить свободность planned numbers.
- В UI перестать показывать существующий `Group` как штатное подразделение.
- Использовать для `Group` продуктовые термины `Group` / `Team` / `Learning group` в соответствии с текущей терминологией проекта.
- Разделить navigation:
  - `Groups`;
  - `Departments / Organization structure`.
- Устранить one-shot загрузки, предполагающие не более 200 users/groups:
  - server pagination;
  - server search;
  - server-side selectors.
- Сохранить существующие Group assignments и Group semantics без миграции в Department.

### Критерии оценки

- [ ] owner decision по TV-020/TV-056 зафиксирован;
- [ ] канонические документы не противоречат друг другу;
- [ ] Group больше не выдаётся за Department;
- [ ] navigation явно разделяет Groups и Departments;
- [ ] Group data/assignments не мигрированы в Department;
- [ ] UI корректно работает при >200 users/groups;
- [ ] server pagination/search покрыты тестами;
- [ ] i18n labels обновлены;
- [ ] planned PR numbering повторно проверена;
- [ ] CI зелёный.

---

## PR 268 — Создать фундамент Department, DepartmentType и OrgStructureEvent

### Задача

Добавить независимую tenant-safe модель данных оргструктуры: базовое дерево подразделений, настраиваемую классификацию типов и фундамент неизменяемой истории изменений.

### Что необходимо сделать

- Добавить Prisma-модель `Department` с полями:
  - `id`;
  - `organizationId`;
  - `parentId?`;
  - `departmentTypeId?`;
  - `name`;
  - `code?`;
  - `description?`;
  - `sortOrder`;
  - `status`;
  - `directManagerMode`;
  - `functionalManagerMode`;
  - timestamps;
  - `archivedAt?`.
- Добавить self-relation `parent/children`.
- Добавить `DepartmentType` как tenant-configurable каталог:
  - `id`;
  - `organizationId`;
  - `code`;
  - `name`;
  - `sortOrder`;
  - `isActive`.
- Тип Department не должен определять parent автоматически и не должен hardcode уровни дерева.
- Добавить `OrgStructureEvent`:
  - tenant;
  - actor;
  - entity type/id;
  - event type;
  - timestamp;
  - safe metadata payload.
- Добавить индексы:
  - `(organizationId, parentId)`;
  - `(organizationId, status)`;
  - tenant/code uniqueness, если code задан.
- Добавить DB-check против self-parent.
- Добавить same-tenant defense для critical relations.
- Явно задать безопасный `onDelete`/archive behavior.
- Не выполнять `Group → Department`.
- Миграцию выполнить additive-first.
- Проверить clean migration и upgrade migration на representative pre-org schema.
- Зафиксировать rollback/forward-fix: после появления real data rollback приложения не должен удалять новые таблицы.

### Критерии оценки

- [ ] Prisma 6.1 generate проходит;
- [ ] `Department`, `DepartmentType`, `OrgStructureEvent` созданы;
- [ ] `Group`/`GroupMember`/`ManagerGroup` не изменили семантику;
- [ ] self-parent запрещён DB-level;
- [ ] tenant/code uniqueness работает;
- [ ] cross-tenant parent невозможно создать;
- [ ] Department может существовать без DepartmentType;
- [ ] migration проходит на clean DB;
- [ ] migration проходит на representative upgrade DB;
- [ ] никакие существующие Group/User data не потеряны;
- [ ] migration/rollback strategy документирована;
- [ ] DB integration tests и CI зелёные.

---

## PR 269 — Реализовать Department Tree API и безопасный reparent

### Задача

Создать canonical backend для произвольной иерархии подразделений на adjacency list с безопасными create/edit/move/archive/restore операциями и защитой от циклов при конкурентных изменениях.

### Что необходимо сделать

- Создать NestJS domain module `departments`.
- Добавить API:
  - `GET /api/v1/departments`;
  - `GET /api/v1/departments/tree`;
  - `GET /api/v1/departments/:id`;
  - `GET /api/v1/departments/:id/children`;
  - `GET /api/v1/departments/:id/path`;
  - `POST /api/v1/departments`;
  - `PATCH /api/v1/departments/:id`;
  - `POST /api/v1/departments/:id/move`;
  - `POST /api/v1/departments/:id/archive`;
  - `POST /api/v1/departments/:id/restore`.
- Добавить DepartmentType API:
  - list;
  - create;
  - edit;
  - archive.
- Для tree/path/descendants использовать parameterized PostgreSQL recursive CTE.
- Ввести technical safety limit глубины, рекомендуемо `MAX_DEPARTMENT_DEPTH = 32`.
- Tree endpoints сделать bounded/lazy-ready, не возвращать всегда полностью раскрытое дерево.
- Реализовать server search по name/code с ancestor path для найденного узла.
- Реализовать deterministic sibling sort.
- Reparent выполнять в `Serializable` transaction с bounded retry `P2034`.
- Перед move проверять:
  - target same tenant;
  - parent same tenant;
  - parent active;
  - self-parent;
  - descendant-parent;
  - resulting depth всего moved subtree.
- Добавить concurrency test `A → B` одновременно с `B → A`.
- Archive не должен каскадно уничтожать историю.
- Restore должен валидировать parent/code/cycle/depth и не реактивировать автоматически закрытые relations.
- Domain mutation + `OrgStructureEvent` записывать в одной transaction.
- Обновить OpenAPI/API contracts.

### Критерии оценки

- [ ] root Department создаётся;
- [ ] child Department создаётся;
- [ ] несколько roots поддерживаются;
- [ ] path/children/search работают;
- [ ] 3+ levels работают;
- [ ] depth overflow отклоняется;
- [ ] self/descendant move отклоняется;
- [ ] concurrent move не может оставить cycle;
- [ ] cross-tenant move запрещён;
- [ ] archived parent нельзя выбрать новым parent;
- [ ] restore не реактивирует исторические links;
- [ ] mutation записывает OrgStructureEvent;
- [ ] API validation/error contract соответствует проекту;
- [ ] OpenAPI/tests/CI зелёные.

---

## PR 270 — Реализовать Department Tree UI

### Задача

Создать полноценный административный интерфейс дерева подразделений уровня референсного UX поверх реального `Department` API.

### Что необходимо сделать

- Добавить отдельную страницу `Departments / Organization structure`.
- Добавить frontend API wrapper в `apps/web/src/shared/api/departments.ts`.
- Реализовать tree table с колонками:
  - Department;
  - code;
  - type;
  - manager summary;
  - users count;
  - actions.
- Реализовать:
  - lazy expand/collapse;
  - раскрытие loaded branch;
  - server search;
  - reveal ancestor path;
  - create root;
  - create child;
  - edit;
  - move;
  - archive;
  - restore через archived/admin surface.
- Добавить selected row action bar/menu.
- Добавить lightweight DepartmentType management:
  - create;
  - edit;
  - archive;
  - assign type to Department.
- Не hardcode типы `Company/Department/Section` в backend/frontend.
- Добавить loading/error/empty states.
- Обновить i18n во всех поддерживаемых locales.
- Обеспечить keyboard navigation, visible focus, `aria-expanded`, доступные dialogs.
- Добавить frontend, a11y и visual regression tests.

### Критерии оценки

- [ ] UI использует только Department API, а не Group;
- [ ] дерево корректно отображает 3+ уровней;
- [ ] lazy load не требует reload страницы;
- [ ] поиск раскрывает ancestor path;
- [ ] create/edit/move/archive/restore работают;
- [ ] DepartmentType управляется без hardcoded levels;
- [ ] backend errors корректно отображаются;
- [ ] i18n keys заполнены;
- [ ] keyboard/a11y сценарии проходят;
- [ ] visual changes reviewed;
- [ ] frontend tests и CI зелёные.

---

## PR 271 — Добавить DepartmentMembership и историю переводов

### Задача

Связать пользователей с подразделениями через историческую relation-модель, поддерживающую primary и additional memberships без использования `User.departmentId`.

### Что необходимо сделать

- Добавить `DepartmentMembership`:
  - `id`;
  - `organizationId`;
  - `departmentId`;
  - `userId`;
  - `positionId?`;
  - `isPrimary`;
  - `effectiveFrom`;
  - `effectiveTo?`;
  - timestamps.
- Current relation определить как `effectiveTo IS NULL`.
- Через custom SQL partial unique indexes обеспечить:
  - максимум один current primary membership на user в tenant;
  - отсутствие duplicate current membership одного user в одном Department.
- Добавить tenant integrity User/Department/Position.
- Добавить API:
  - `GET /departments/:id/users`;
  - `GET /users/:id/department-memberships`;
  - `POST /department-memberships`;
  - `POST /department-memberships/:id/close`;
  - `POST /users/:id/department-transfer`;
  - `POST /departments/:id/users/bulk-transfer`.
- Transfer выполнять одной transaction:
  - закрыть current primary;
  - создать новый;
  - записать event.
- Additional memberships не должны закрывать primary.
- Historical rows не редактировать обычным update.
- Existing users не распределять по Department автоматически.
- Не выводить Department из Group membership.
- Bulk transfer сделать atomic либо иметь строго документированную batch semantics без silent partial state.
- Добавить concurrency tests на два одновременных primary membership.

### Критерии оценки

- [ ] максимум один current primary DB-enforced;
- [ ] additional memberships поддерживаются;
- [ ] duplicate current same Department запрещён;
- [ ] concurrent primary race не нарушает invariant;
- [ ] transfer сохраняет историю;
- [ ] bulk transfer не создаёт скрытого partial state;
- [ ] cross-tenant relation невозможна;
- [ ] archived user/Department нельзя использовать для новой current relation;
- [ ] event history пишется;
- [ ] существующие Users не получают выдуманный Department;
- [ ] integration tests и CI зелёные.

---

## PR 272 — Реализовать несколько DepartmentManager и наследование руководителей

### Задача

Добавить 0..N структурных и функциональных руководителей одного подразделения, primary manager и вычисляемое наследование по дереву.

### Что необходимо сделать

- Добавить `DepartmentManager`:
  - tenant;
  - Department;
  - User;
  - `type = DIRECT | FUNCTIONAL`;
  - `isPrimary`;
  - `effectiveFrom`;
  - `effectiveTo?`;
  - timestamps.
- Через custom SQL partial unique indexes обеспечить:
  - отсутствие duplicate current manager одного типа;
  - максимум один current primary manager каждого type.
- Разрешить несколько `DIRECT`.
- Разрешить несколько `FUNCTIONAL`.
- Manager должен быть active User того же tenant, но не обязан состоять в управляемом Department.
- Реализовать manager modes:
  - `LOCAL`;
  - `INHERIT`;
  - `MERGE`.
- Для `INHERIT` вычислять effective managers по ancestor chain без физического копирования строк.
- Для `MERGE` объединять local + inherited с dedupe по `userId + type`.
- Primary precedence:
  - local primary;
  - inherited primary;
  - null.
- API effective manager должен возвращать source:
  - `LOCAL`;
  - `INHERITED`;
  - `sourceDepartmentId`.
- Переключение `LOCAL/MERGE → INHERIT` при существующих current local managers должно возвращать conflict до их явного закрытия.
- Не изменять RBAC-role пользователя при manager assignment.
- Добавить API managers и manager-modes.
- Записывать event history в той же transaction.
- Добавить concurrency tests на primary manager race.

### Критерии оценки

- [ ] Department поддерживает несколько DIRECT managers;
- [ ] Department поддерживает несколько FUNCTIONAL managers;
- [ ] максимум один primary каждого type DB-enforced;
- [ ] duplicate current manager невозможен;
- [ ] concurrent primary race безопасен;
- [ ] LOCAL работает;
- [ ] INHERIT работает через минимум 3 уровня;
- [ ] MERGE работает и дедуплицирует managers;
- [ ] local primary имеет корректный priority;
- [ ] inherited rows не материализуются в descendants;
- [ ] mode switching не скрывает active local managers;
- [ ] manager assignment не повышает RBAC;
- [ ] history/tests/CI зелёные.

---

## PR 273 — Реализовать UI сотрудников и руководителей подразделения

### Задача

Довести административные сценарии работы с сотрудниками и несколькими руководителями до полноценно используемого интерфейса.

### Что необходимо сделать

- В Department editor добавить:
  - DIRECT managers multi-select;
  - FUNCTIONAL managers multi-select;
  - primary manager selector каждого type;
  - `LOCAL/INHERIT/MERGE`;
  - отображение inherited source Department;
  - закрытие current assignment.
- В tree table показывать:
  - primary DIRECT manager;
  - `Name + N` для нескольких managers;
  - popover/details со всеми DIRECT/FUNCTIONAL;
  - local/inherited marker.
- Создать Department users page:
  - server search;
  - pagination;
  - Position placeholder/column;
  - primary/additional membership;
  - current/historical view;
  - transfer;
  - bulk transfer;
  - additional membership create/close.
- В UI явно отделить manager relation от RBAC-role.
- Добавить confirmation/error flows для conflicts.
- Обновить i18n, a11y, frontend/E2E tests.

### Критерии оценки

- [ ] несколько DIRECT/FUNCTIONAL managers назначаются через UI;
- [ ] primary manager выбирается отдельно для каждого type;
- [ ] LOCAL/INHERIT/MERGE настраиваются через UI;
- [ ] inherited manager визуально отличим от local;
- [ ] source Department отображается;
- [ ] Department users page поддерживает >200 users;
- [ ] transfer/bulk/additional membership работают;
- [ ] membership history доступна admin;
- [ ] UI не выдаёт manager assignment за RBAC-role;
- [ ] i18n/a11y/tests/CI зелёные.

---

## PR 274 — Добавить корректный headcount и bounded tree aggregation

### Задача

Сделать дерево пригодным для реальных административных и отчётных нагрузок: корректно считать сотрудников без double-count и исключить N+1/unbounded tree reads.

### Что необходимо сделать

- В tree/read API добавить:
  - `directUserCount`;
  - `subtreeUserCount`;
  - optional `additionalMembershipCount`.
- `directUserCount` считать по current active primary membership только прямого Department.
- `subtreeUserCount` считать unique users по current active primary membership Department + descendants.
- Additional memberships не должны увеличивать основной headcount.
- Historical memberships и archived users исключить из current count.
- Counts считать DB-side.
- Убрать N+1 по Department.
- Проверить counts после:
  - user transfer;
  - additional membership;
  - reparent subtree;
  - archive.
- Сохранить bounded/lazy tree response.
- Добавить representative dataset/query-plan tests.
- Добавить необходимые indexes только после EXPLAIN/измерений.

### Критерии оценки

- [ ] direct count корректен;
- [ ] subtree count корректен;
- [ ] additional membership не double-count;
- [ ] transfer корректно меняет counts;
- [ ] reparent корректно меняет subtree counts;
- [ ] historical/archived users не попадают в current headcount;
- [ ] критический tree path не делает N+1;
- [ ] response остаётся bounded;
- [ ] representative DB test проходит;
- [ ] CI зелёный.

---

## PR 275 — Добавить Position catalog и связь должности с Membership

### Задача

Нормализовать должности в отдельный tenant-scoped справочник и хранить должность в контексте фактического DepartmentMembership, сохраняя историческое значение.

### Что необходимо сделать

- Добавить `Position`:
  - tenant;
  - code;
  - title;
  - description?;
  - status/archive;
  - timestamps.
- `(organizationId, code)` сделать unique.
- Добавить `positionId?` в `DepartmentMembership`.
- Текущую должность пользователя определять через current primary membership.
- Historical membership сохраняет historical Position.
- Additional membership может иметь собственный Position.
- Добавить API:
  - list/search;
  - get;
  - create;
  - update;
  - archive.
- Добавить admin Position UI:
  - table;
  - search;
  - create/edit/archive.
- В membership/user UI добавить searchable Position selector.
- Archived Position нельзя назначить новой current relation.
- Legacy `User.position` не удалять и не ломать в этом PR.
- Обновить OpenAPI/shared frontend API/docs/tests.

### Критерии оценки

- [ ] Position tenant-scoped;
- [ ] duplicate code внутри tenant запрещён;
- [ ] current membership поддерживает Position;
- [ ] historical Position сохраняется после transfer/change;
- [ ] additional membership может иметь Position;
- [ ] archived Position нельзя назначить заново;
- [ ] legacy `User.position` остаётся совместимым;
- [ ] Position UI/search/selectors работают;
- [ ] DB/frontend tests и CI зелёные.

---

## PR 276 — Безопасно мигрировать legacy User.position

### Задача

Перенести существующие строковые должности в `Position`/Membership без потери исходных данных и без автоматического выдумывания Department для пользователей, которые ещё не размещены в оргструктуре.

### Что необходимо сделать

- Реализовать inventory всех legacy `User.position`.
- Подготовить normalization report.
- Не объединять неоднозначные строки автоматически.
- Реализовать explicit mapping:
  - legacy value → Position.
- Добавить dry-run.
- Backfill делать idempotent.
- Для user с current primary DepartmentMembership:
  - заполнить `membership.positionId` согласно mapping.
- Для user без current primary Department:
  - не создавать искусственный membership;
  - оставить запись в unresolved/backfill report.
- Сохранить исходное `User.position`.
- Добавить validation report:
  - mapped;
  - unresolved;
  - ambiguous;
  - skipped.
- Описать migration/rollback/forward-fix.
- Не выполнять `DROP User.position`.

### Критерии оценки

- [ ] каждая legacy строка учтена;
- [ ] ambiguous values видимы и не объединяются молча;
- [ ] dry-run воспроизводим;
- [ ] apply idempotent;
- [ ] mapped users с membership получают positionId;
- [ ] users без Department не получают выдуманный membership;
- [ ] unresolved report полный;
- [ ] исходный `User.position` сохранён;
- [ ] rollback/forward-fix документированы;
- [ ] migration tests и CI зелёные.

---

## PR 277 — Интегрировать Department и Position с LMS targeting

### Задача

Добавить назначения обучения по подразделению и должности так, чтобы новые targets реально участвовали в learner eligibility/progress, а существующие User/Group assignments остались обратно совместимыми.

### Что необходимо сделать

- Расширить Assignment target:
  - `userId`;
  - `groupId`;
  - `departmentId`.
- Валидировать exactly-one target.
- Для Department добавить `includeDescendants`.
- Перед DB CHECK выполнить preflight существующих Assignment rows.
- Только после preflight добавить DB exactly-one constraint.
- Department assignment применять к current primary memberships.
- Additional membership не должен автоматически давать Department assignment.
- Семантика `includeDescendants=true` — current subtree.
- Reparent должен менять dynamic audience; UI обязан предупреждать об impact.
- Добавить `PositionCourse`:
  - Position;
  - Course;
  - `REQUIRED | OPTIONAL`;
  - optional `dueDays`;
  - active/archive semantics;
  - tenant uniqueness/integrity.
- Реализовать `LearningTargetResolver`/эквивалент:
  - direct Assignment;
  - Group Assignment;
  - Department Assignment;
  - PositionCourse.
- Перевести `ProgressService.ensureLearnerCanRecordProgress()` на единый resolver.
- Найти и обновить остальные consumers learner eligibility.
- Дедуплицировать один Course, пришедший из нескольких sources, сохраняя объяснимый source list.
- Явно зафиксировать и реализовать policy конфликтов нескольких sources одного Course:
  - `DIRECT_ASSIGNMENT`;
  - `GROUP`;
  - `DEPARTMENT`;
  - `POSITION`.
- Для effective requirement определить детерминированно:
  - effective requirement type (`REQUIRED`/`OPTIONAL`);
  - effective due date;
  - source precedence;
  - полный source list;
  - поведение при исчезновении одного source;
  - поведение уже начатого Progress.
- Без отдельного business rule не выбирать precedence произвольно: policy должна быть документирована и покрыта тестами.
- Не удалять Progress/Certificates при transfer/reparent/Position change.
- Добавить UI Department target и PositionCourse management.
- Обновить OpenAPI/shared types/tests/docs.

### Критерии оценки

- [ ] существующий User target работает без регресса;
- [ ] существующий Group target работает без регресса;
- [ ] Department direct target работает;
- [ ] Department descendants target работает;
- [ ] user вне subtree не получает target;
- [ ] additional-only membership не даёт Department target;
- [ ] PositionCourse REQUIRED/OPTIONAL работает;
- [ ] overlapping sources дедуплицируются;
- [ ] для conflict cases нескольких sources определены и протестированы requirement type, due date, source precedence и removal semantics;
- [ ] исчезновение одного source не удаляет валидный requirement, если остаётся другой;
- [ ] уже начатый Progress не повреждается при изменении source composition;
- [ ] `ProgressService` признаёт Department/Position eligibility;
- [ ] reparent semantics покрыты тестами и UI warning;
- [ ] learning history не удаляется;
- [ ] DB integration/frontend tests и CI зелёные.

---

## PR 278 — Реализовать OrganizationScope, RBAC и Department reports

### Задача

Связать орготношения с безопасным доступом руководителей к пользователям и отчётам, не смешивая `DepartmentManager` с RBAC и не ломая существующий `ManagerGroup` scope.

### Что необходимо сделать

- Добавить central `OrganizationScope`.
- Источники read scope:
  - admin → tenant-wide;
  - legitimate `ManagerGroup`;
  - current `DepartmentManager(DIRECT)` для actor с RBAC-role `manager`.
- Для DIRECT manager разрешить Department + descendants read/report scope по принятой policy.
- `FUNCTIONAL` manager по default оставить metadata-only без data scope.
- Если у Department несколько DIRECT managers, каждый с RBAC-role `manager` получает legitimate scope; `isPrimary` влияет на display, не на наличие relation.
- Effective users объединять как `UNION`, без дублей.
- Явно зафиксировать semantics additional membership:
  - additional `DepartmentMembership` не делает пользователя автоматически manager-readable через Department scope;
  - additional membership не участвует в primary headcount;
  - additional membership не является Department learning target по default;
  - доступ/обучение по additional membership возможны только через отдельное explicit policy.
- Orgstructure writes оставить admin-only по default, чтобы manager не менял источник собственного scope.
- Для nested manager UI разрешить минимальный ancestor path metadata для breadcrumbs без доступа к ancestor users/reports.
- Добавить Department filters в реально существующие report endpoints:
  - `departmentId`;
  - `includeDescendants`.
- Сохранить existing report behavior, если new filter отсутствует.
- Reports выполнять DB-side/bounded.
- Синхронизировать:
  - `roles.ts`;
  - `docs/API_RBAC_MATRIX.md`;
  - API docs;
  - authorization consistency tests.
- Добавить Actor × Resource × Action regression matrix минимум для двух tenants.

### Критерии оценки

- [ ] DepartmentManager сам по себе не выдаёт RBAC-role;
- [ ] DIRECT + manager role даёт только разрешённый subtree scope;
- [ ] FUNCTIONAL не расширяет data scope по default;
- [ ] sibling branch закрыта;
- [ ] foreign tenant закрыт;
- [ ] ManagerGroup legitimate scope сохранён;
- [ ] overlap Group+Department дедуплицирован;
- [ ] additional membership не расширяет Department manager scope, headcount или training target без explicit policy;
- [ ] manager не может изменять источник собственного org scope;
- [ ] Department direct/subtree reports работают;
- [ ] existing no-filter reports не изменились;
- [ ] RBAC matrix соответствует коду;
- [ ] authorization regression matrix проходит;
- [ ] CI зелёный.

---

## PR 279 — Добавить Personal ReportingLine и интегрировать его в scope

### Задача

Поддержать персональную матричную линию подчинения отдельно от Department tree и включить легитимные DIRECT reporting relations в manager read/report scope.

### Что необходимо сделать

- Добавить `ReportingLine`:
  - tenant;
  - employee;
  - manager;
  - `DIRECT | FUNCTIONAL | PROJECT`;
  - `isPrimary`;
  - `effectiveFrom`;
  - `effectiveTo?`;
  - timestamps.
- Custom partial unique indexes:
  - duplicate current relation;
  - максимум один current primary per employee/type.
- Запретить self-manager.
- Для DIRECT chain запретить cycle.
- DIRECT mutation выполнять concurrency-safe transaction.
- Реализовать effective personal manager resolver:
  - personal primary DIRECT;
  - fallback to effective Department DIRECT primary;
  - null.
- Добавить API:
  - list user reporting lines;
  - create/update/close;
  - effective managers.
- Добавить admin UI в User profile.
- Расширить `OrganizationScope`:
  - current DIRECT ReportingLine + RBAC manager даёт read/report employee scope;
  - DIRECT chain descendants могут учитываться рекурсивно;
  - FUNCTIONAL/PROJECT остаются fail-closed по default.
- Объединять Department/ReportingLine/ManagerGroup scope через `UNION`.
- Записывать OrgStructureEvent.
- Добавить cycle/concurrency/cross-tenant/auth tests.

### Критерии оценки

- [ ] personal DIRECT relation работает;
- [ ] FUNCTIONAL/PROJECT relation хранится отдельно;
- [ ] self-manager запрещён;
- [ ] DIRECT cycle невозможен;
- [ ] concurrent operations не создают cycle;
- [ ] effective manager fallback на Department работает;
- [ ] DIRECT ReportingLine scope выдаётся только actor с RBAC manager;
- [ ] FUNCTIONAL/PROJECT не расширяют data scope;
- [ ] overlap всех scope sources дедуплицирован;
- [ ] cross-tenant relation невозможна;
- [ ] history/event сохраняются;
- [ ] tree structure не меняется;
- [ ] tests/CI зелёные.

---

## PR 280 — Реализовать импорт, lifecycle и полную operational history

### Задача

Сделать модуль обслуживаемым в реальной организации: безопасно импортировать структуру, контролировать archive/restore lifecycle и иметь полную историю критических оргизменений.

### Что необходимо сделать

- Реализовать CSV import для Departments:
  - code;
  - name;
  - parentCode;
  - typeCode;
  - sortOrder;
  - manager modes;
  - multiple DIRECT/FUNCTIONAL manager identifiers.
- Реализовать CSV import memberships:
  - user;
  - department;
  - primary/additional;
  - Position;
  - effectiveFrom.
- Pipeline:
  - upload;
  - parse;
  - normalize;
  - validate;
  - preview;
  - confirm;
  - transactional apply;
  - post-validation.
- `preview` должен выдавать opaque server token/hash.
- `commit` должен подтверждать именно validated preview payload.
- Поддержать явные modes:
  - `CREATE_ONLY`;
  - `UPSERT`.
- Не реализовывать implicit destructive sync.
- Валидации:
  - duplicate code;
  - unknown parent;
  - cycle;
  - depth;
  - unknown/archived type;
  - invalid manager mode;
  - duplicate/unknown managers;
  - >1 primary manager/type;
  - unknown user/Position;
  - primary membership conflict;
  - cross-tenant;
  - dates;
  - file/row bounds.
- Archive lifecycle:
  - active children → conflict;
  - current memberships → conflict;
  - current managers → conflict;
  - active Department assignments → conflict.
- Restore:
  - валидирует parent/code/cycle/depth;
  - не реактивирует автоматически closed memberships/managers/assignments.
- Зафиксировать lifecycle User при `disabled/archived`:
  - исторические `DepartmentMembership`, `DepartmentManager`, `ReportingLine` не удаляются;
  - archived/disabled User не входит в current headcount;
  - archived/disabled manager не выдаёт active OrganizationScope;
  - archived/disabled User нельзя назначить в новую current relation;
  - автоматическое закрытие current relations не выполнять без явно выбранной policy;
  - если current relation остаётся исторически открытой технически, effective resolvers обязаны фильтровать неактивного User.
- Довести `OrgStructureEvent` до полного покрытия:
  - create/update/move/archive/restore;
  - membership;
  - managers/modes;
  - Position;
  - ReportingLine;
  - import.
- Добавить paginated admin history UI.
- Не писать secrets/raw import body в event payload.
- Документировать sample CSV, import modes, bounds, rollback/compensating operations.

### Критерии оценки

- [ ] preview показывает ошибки до записи;
- [ ] invalid import не оставляет partial data;
- [ ] preview/commit tamper блокируется;
- [ ] CREATE_ONLY идемпотентно/предсказуемо работает;
- [ ] UPSERT имеет документированную semantics;
- [ ] multi-level tree импортируется;
- [ ] multiple managers импортируются;
- [ ] membership conflicts выявляются;
- [ ] oversized input отклоняется до записи;
- [ ] archive не выполняет destructive cascade;
- [ ] restore не создаёт скрытый access/training side effect;
- [ ] disabled/archived User не учитывается в current headcount;
- [ ] disabled/archived manager не расширяет active scope;
- [ ] historical org relations не удаляются при user lifecycle change;
- [ ] каждая критическая mutation имеет event;
- [ ] history tenant-scoped;
- [ ] integration/E2E/docs/CI зелёные.

---

## PR 281 — Провести performance verification и conditional hierarchy optimization

### Задача

Доказать, что canonical adjacency-list архитектура удовлетворяет реальным нагрузкам. Если нет — добавить измеримо полезную derived optimization, не меняя source of truth без необходимости.

### Что необходимо сделать

- Создать representative dataset минимум:
  - 2 tenants;
  - 1 000 Departments;
  - 10 000 Users;
  - 12 000 current memberships;
  - depth ≥ 8;
  - multiple DIRECT/FUNCTIONAL managers;
  - Department assignments;
  - Position requirements;
  - report data.
- До запуска benchmark зафиксировать измеримые performance acceptance thresholds/SLO для representative environment:
  - p95 tree/root response;
  - p95 lazy children response;
  - p95 subtree count;
  - p95 OrganizationScope resolution;
  - p95 Department assignment audience resolution;
  - p95 report query;
  - import preview/apply limits;
  - maximum acceptable response payload size.
- Thresholds должны быть записаны до измерения и не подбираться постфактум под фактический результат.
- Измерить и проверить EXPLAIN для:
  - roots/tree;
  - lazy children;
  - search/path;
  - direct/subtree headcount;
  - effective manager resolution;
  - OrganizationScope;
  - LearningTargetResolver;
  - Department assignment audience;
  - reports;
  - import preview/apply.
- Доказать отсутствие unbounded/N+1 critical paths.
- Проверить bounded response sizes.
- Провести a11y/i18n/visual regression final pass.
- Если adjacency CTE удовлетворяет согласованному performance gate:
  - зафиксировать `optimization = NOT REQUIRED`.
- Если bottleneck подтверждён:
  1. benchmark `DepartmentClosure`;
  2. benchmark PostgreSQL `ltree`;
  3. сравнить read/write/reparent/migration cost;
  4. выбрать измеримо лучший вариант;
  5. оставить adjacency canonical source;
  6. добавить derived projection additive-first;
  7. backfill;
  8. dual-verify результаты;
  9. переключить reads;
  10. rollback = вернуть reads на adjacency.
- Не обновлять major Prisma только ради hierarchy storage.
- Финально синхронизировать:
  - architecture docs;
  - migration/rollback runbook;
  - OpenAPI/RBAC docs;
  - admin guide;
  - import guide.

### Критерии оценки

- [ ] performance acceptance thresholds/SLO зафиксированы до benchmark;
- [ ] performance baseline сохранён;
- [ ] representative dataset соответствует плану;
- [ ] critical queries имеют reviewable EXPLAIN evidence;
- [ ] tree/search/count/scope/assignment/report paths bounded;
- [ ] критические N+1 отсутствуют;
- [ ] если bottleneck отсутствует — optimization документированно `NOT REQUIRED`;
- [ ] если bottleneck есть — выбранный projection быстрее на representative workload;
- [ ] canonical adjacency correctness сохранена;
- [ ] migration/backfill/rollback optimization проверены;
- [ ] a11y/i18n/visual regression проходят;
- [ ] clean DB migration проходит;
- [ ] representative upgrade migration проходит;
- [ ] полный 2-tenant authorization matrix проходит;
- [ ] все org integration/E2E tests проходят;
- [ ] документация соответствует коду;
- [ ] GitHub CI зелёный;

---


## PR 282 — Добавить observability и operational diagnostics оргструктуры

### Задача

Сделать модуль оргструктуры наблюдаемым в эксплуатации: измерять критические запросы, видеть ошибки import/reparent/scope resolution и получать диагностические данные без утечки PII и без high-cardinality metrics.

### Что необходимо сделать

- Добавить low-cardinality operational metrics минимум для:
  - `org_department_tree_query_duration`;
  - `org_scope_resolution_duration`;
  - `org_import_rows_total`;
  - `org_import_failures_total`;
  - `org_reparent_conflicts_total`.
- При наличии current metrics abstraction проекта использовать её, не вводить параллельный monitoring stack.
- Для latency metrics определить единицы измерения и histogram/bucket strategy согласно существующему telemetry подходу проекта.
- Не использовать как metric labels:
  - user email;
  - user ID;
  - Department ID;
  - Department name;
  - arbitrary tenant-generated values.
- Добавить structured diagnostics/logging для:
  - failed reparent;
  - cycle/depth conflict;
  - import validation/apply failure;
  - OrganizationScope resolution failure;
  - DB constraint conflict.
- Не логировать:
  - raw CSV rows;
  - auth tokens;
  - secrets;
  - произвольный request body;
  - лишние персональные данные.
- Добавить request/correlation context в рамках уже существующей logging policy проекта.
- Добавить operational diagnostics в admin/support документацию:
  - какие метрики доступны;
  - что означает рост conflicts/failures;
  - как отличить authorization deny от system failure;
  - какие данные безопасно использовать при расследовании.
- Добавить tests для:
  - metric emission;
  - error-path logging;
  - отсутствия PII/high-cardinality labels там, где это можно проверить автоматически.
- Проверить, что observability instrumentation не меняет authorization и domain semantics.

### Критерии оценки

- [ ] critical tree/scope/import/reparent metrics публикуются;
- [ ] metrics имеют low-cardinality labels;
- [ ] email/User/Department identifiers не используются как metric labels;
- [ ] raw import content и secrets не попадают в logs;
- [ ] reparent/import/scope failures диагностируются;
- [ ] instrumentation не меняет business result;
- [ ] operational documentation обновлена;
- [ ] tests покрывают success/error instrumentation;
- [ ] lint/typecheck/tests/build проходят;
- [ ] GitHub CI зелёный.

---

## PR 283 — Добавить external identifiers и HRIS/SCIM readiness

### Задача

Подготовить оргструктуру к будущей интеграции с HRIS/SCIM/1С и другими внешними системами без смешивания внешних идентификаторов с внутренними UUID и без реализации самого connector в текущем scope.

### Что необходимо сделать

- Добавить tenant-scoped `OrgExternalReference`/эквивалентную модель:
  - `id`;
  - `organizationId`;
  - `entityType`;
  - `entityId`;
  - `sourceSystem`;
  - `externalId`;
  - timestamps.
- Определить поддерживаемые entity types initial scope:
  - `DEPARTMENT`;
  - `DEPARTMENT_TYPE`;
  - `POSITION`;
  - при необходимости `USER` только если это согласуется с текущим User integration contract.
- Internal UUID остаётся единственным canonical primary key.
- External ID не использовать как FK между внутренними domain tables.
- Добавить uniqueness:
  - один `(organizationId, sourceSystem, entityType, externalId)` не должен ссылаться на разные internal entities;
  - одна internal entity может иметь references из нескольких source systems.
- Все lookups выполнять tenant-scoped.
- Архивирование internal entity не должно удалять historical external mapping автоматически.
- Не позволять external reference реактивировать archived entity без явной domain operation.
- Добавить API/service только если он реально нужен admin/import flow; иначе оставить internal service abstraction до появления connector.
- Расширить import так, чтобы при необходимости он мог безопасно resolve entity по:
  - canonical business code;
  - либо approved external reference,
  не создавая implicit destructive sync.
- Документировать mapping rules для будущего connector:
  - internal UUID ≠ external ID;
  - external system не является security authority;
  - tenant context обязателен;
  - connector writes должны проходить те же domain validations, что admin/API mutations.
- Не реализовывать:
  - SCIM endpoint;
  - HRIS polling;
  - webhook sync;
  - destructive external reconciliation;
  - background sync jobs.
- Добавить migration/integration tests для duplicate/external/cross-tenant cases.

### Критерии оценки

- [ ] internal UUID не заменён external identifier;
- [ ] external references tenant-scoped;
- [ ] duplicate external ID внутри одного source/entity type запрещён;
- [ ] одна entity может иметь references разных source systems;
- [ ] cross-tenant resolution невозможен;
- [ ] archive не теряет external mapping history;
- [ ] external reference не обходит domain validation;
- [ ] import может использовать approved mapping без destructive sync;
- [ ] SCIM/HRIS connector в этот PR не внедрён;
- [ ] migration/integration tests проходят;
- [ ] документация extension point обновлена;
- [ ] CI зелёный.

---

## PR 284 — Выполнить финальную интеграционную верификацию и release gate оргструктуры

### Задача

Проверить модуль оргструктуры как единую систему после реализации PR 266–283 и подтвердить готовность к release без скрытых несовместимостей между schema, API, UI, RBAC, LMS targeting, reports, import, history и migrations.

### Что необходимо сделать

- Выполнить отдельный финальный verification pass, не смешивая его с feature development.
- Проверить database rollout:
  - clean DB migrations с нуля;
  - representative upgrade migration с pre-org schema/data;
  - generated/custom SQL migrations;
  - partial unique indexes;
  - tenant constraints;
  - self-parent constraint;
  - exactly-one Assignment target constraint;
  - отсутствие invalid cycles;
  - отсутствие duplicate current primary memberships/managers/reporting lines.
- Проверить security на минимум двух tenants:
  - PR 266 exploit regression;
  - admin;
  - DIRECT Department manager;
  - FUNCTIONAL manager;
  - ReportingLine DIRECT manager;
  - Group-only manager;
  - Group + Department + ReportingLine overlap;
  - sibling;
  - foreign tenant;
  - manager self-scope mutation deny.
- Проверить end-to-end functional flows:
  - create multi-level Department tree;
  - move/reorder;
  - archive/restore;
  - DepartmentType;
  - primary/additional membership;
  - transfer/bulk transfer/history;
  - multiple DIRECT/FUNCTIONAL managers;
  - LOCAL/INHERIT/MERGE;
  - Position;
  - legacy position migrated/unresolved;
  - ReportingLine;
  - Department Assignment;
  - PositionCourse;
  - learner Progress eligibility через `LearningTargetResolver`;
  - Department reports;
  - import preview/commit;
  - OrgStructureEvent history;
  - external reference mapping.
- Проверить lifecycle:
  - archived Department;
  - archived User;
  - archived Position;
  - inactive manager;
  - restore без скрытой реактивации relations/targets.
- Проверить frontend:
  - reference-level tree UI;
  - >200 users;
  - server search/pagination;
  - error/empty/loading states;
  - manager inheritance display;
  - accessibility;
  - i18n;
  - visual regression.
- Проверить performance evidence PR 281:
  - agreed thresholds;
  - benchmark results;
  - optimization `NOT REQUIRED` либо verified derived projection.
- Проверить observability PR 282:
  - metrics;
  - diagnostics;
  - отсутствие PII/high-cardinality telemetry.
- Синхронизировать финальную документацию:
  - `README.md`, если status изменился;
  - `docs/DEVELOPMENT_PLAN.md`;
  - `docs/TODO_VERIFY.md`;
  - `docs/PROJECT_SOURCE_OF_TRUTH.md`;
  - `docs/API_RBAC_MATRIX.md`;
  - API/OpenAPI contracts;
  - migration guide;
  - admin org-structure guide;
  - import guide;
  - rollback/forward-fix runbook;
  - operational diagnostics guide;
  - external integration readiness guide.
- Зафиксировать unresolved items:
  - только явно out-of-scope future enhancements;
  - не оставлять module-critical `OWNER-DECISION`.
- Production deployment/migration не выполнять без отдельного явного разрешения.

### Критерии оценки

- [ ] clean migration проходит;
- [ ] representative upgrade migration проходит;
- [ ] DB constraints/indexes соответствуют design;
- [ ] invalid org data не обнаружены;
- [ ] полный 2-tenant authorization matrix проходит;
- [ ] PR 266 exploit regression проходит;
- [ ] admin full-flow E2E проходит;
- [ ] manager scoped-flow E2E проходит;
- [ ] learner effective-training flow E2E проходит;
- [ ] Department/Position/ReportingLine/LMS/report/import/history flows интегрированы;
- [ ] archive/restore/user lifecycle semantics подтверждены;
- [ ] accessibility/i18n/visual checks проходят;
- [ ] performance gate PR 281 закрыт;
- [ ] observability gate PR 282 закрыт;
- [ ] external mapping readiness PR 283 закрыта;
- [ ] OpenAPI/RBAC/docs соответствуют коду;
- [ ] нет незакрытого module-critical owner decision;
- [ ] все существующие repository checks и GitHub CI зелёные;
- [ ] модуль соответствует Definition of Done полной архитектурной спецификации;
- [ ] production mutation не выполнялась без explicit approval.

---

# Итоговая последовательность

```text
PR 266  Security fix ManagerGroup
   ↓
PR 267  Owner scope + Group/Department separation
   ↓
PR 268  Department / DepartmentType / OrgStructureEvent foundation
   ↓
PR 269  Department Tree API + safe reparent
   ↓
PR 270  Department Tree UI
   ↓
PR 271  DepartmentMembership + transfer history
   ↓
PR 272  Multiple DepartmentManagers + inheritance
   ↓
PR 273  Users/managers UI
   ↓
PR 274  Headcount + bounded aggregation
   ↓
PR 275  Position catalog
   ↓
PR 276  Legacy User.position migration
   ↓
PR 277  Department LMS targeting + PositionCourse
   ↓
PR 278  OrganizationScope + RBAC + Department reports
   ↓
PR 279  Personal ReportingLine + scope integration
   ↓
PR 280  Import + lifecycle + durable history
   ↓
PR 281  Performance verification + conditional optimization
   ↓
PR 282  Observability + operational diagnostics
   ↓
PR 283  External identifiers / HRIS-SCIM readiness
   ↓
PR 284  Final integration verification + release gate
```

# Финальный критерий завершения серии

Серия PR 266–284 завершена только когда реализованы и проверены:

- security fix существующего Group manager scope;
- отдельный Department domain;
- DepartmentType;
- безопасное дерево с reparent/archive/restore;
- DepartmentMembership primary/additional/history;
- несколько DIRECT/FUNCTIONAL managers;
- LOCAL/INHERIT/MERGE;
- Position и безопасная legacy migration;
- Department/Position learning targeting;
- OrganizationScope/RBAC;
- Department reports;
- ReportingLine;
- import preview/commit;
- durable org history;
- корректный headcount;
- tenant isolation;
- concurrency invariants;
- bounded performance;
- i18n/a11y;
- clean/upgrade migrations;
- OpenAPI/RBAC/docs consistency;
- operational observability без PII/high-cardinality telemetry;
- external identifier readiness без внедрения connector;
- отдельный final integration/release gate;
- зелёный CI.
