# План реализации модуля «Оргструктура»

## Описание проекта

Модуль «Оргструктура» предназначен для хранения и управления формальной организационной структурой компании внутри tenant/organization.

Модуль должен быть отдельным доменом и не заменять существующий `Group`.

`Group` продолжает использоваться как учебная/операционная группа.  
`Department` описывает официальную организационную структуру компании.

Модуль должен включать:

- дерево подразделений `Department`;
- настраиваемые типы подразделений `DepartmentType`;
- основное и дополнительное членство сотрудников `DepartmentMembership`;
- историю переводов сотрудников между подразделениями;
- руководителей подразделений `DepartmentManager`;
- типы руководителей `DIRECT` и `FUNCTIONAL`;
- режимы наследования руководителей `LOCAL`, `INHERIT`, `MERGE`;
- справочник должностей `Position`;
- персональные линии подчинения `ReportingLine`;
- расчёт численности подразделений;
- назначение обучения подразделениям;
- назначение обучения должностям через `PositionCourse`;
- единый механизм определения доступного пользователю обучения `LearningTargetResolver`;
- manager object scope для пользователей, progress и reports;
- импорт оргструктуры и memberships из CSV;
- archive/restore lifecycle;
- долговечную историю изменений `OrgStructureEvent`;
- external identifiers для будущей интеграции с HRIS/SCIM;
- performance verification;
- observability;
- итоговую интеграционную и release-проверку.

### Основные архитектурные правила

1. `Department` и `Group` — разные сущности и разные домены.
2. `Department` имеет одного structural parent через `parentId`.
3. Допускается несколько корневых подразделений.
4. Максимальная глубина дерева — 32 уровня.
5. Structural multi-parent graph не поддерживается.
6. Иерархия хранится как adjacency list через `Department.parentId`.
7. Для обхода дерева используется PostgreSQL recursive CTE.
8. Closure table или `ltree` допускаются только после измеренного performance bottleneck.
9. Членство сотрудника хранится через `DepartmentMembership`, а не через `User.departmentId`.
10. Допускается один current primary membership и несколько additional memberships.
11. Руководители хранятся отдельными `DepartmentManager` records.
12. `DepartmentManager` не выдаёт RBAC-роль `manager` автоматически.
13. Дополнительное membership не участвует по умолчанию в headcount, Department training targeting и manager scope.
14. Персональное подчинение хранится отдельно через `ReportingLine`.
15. Должность хранится через `Position`; legacy `User.position` мигрируется безопасно и не удаляется на первом этапе.
16. Existing `Group`, `GroupMember`, `ManagerGroup`, User/Group assignments и Progress должны сохранить совместимость.
17. Все критические связи tenant-safe.
18. Concurrency-sensitive операции выполняются в `Serializable` transaction.
19. При Prisma `P2034` допускается bounded retry, максимум 5 попыток.
20. Public hard delete для оргсущностей не используется; применяется archive/restore.
21. Критические изменения оргструктуры записываются в `OrgStructureEvent` в той же transaction.
22. Production migration/deployment не является частью реализации обычного PR и выполняется отдельно.

---

## PR 266 — Закрыть privilege escalation через ManagerGroup

**Статус: реализовано.** Mutation manager-set и общие изменения Group доступны только admin; manager может изменять members только уже управляемой активной Group, с tenant-scoped проверкой до записи.

### Задача

Исправить существующую возможность пользователя с ролью `manager` самостоятельно расширять свой доступ через изменение `ManagerGroup`, состава чужих групп или manager membership.

Этот PR должен быть выполнен до начала реализации новой оргструктуры, потому что новый manager scope будет объединяться с существующим Group scope.

### Что необходимо сделать

- Найти все endpoints и services, которые изменяют:
  - members группы;
  - managers группы;
  - `ManagerGroup`.
- Добавить object-level authorization для каждой mutation.
- Перед изменением состава группы проверять scope пользователя.
- Разрешить manager изменять members только той группы, которой он уже управляет до начала операции.
- Изменение списка managers группы разрешить только admin.
- Все Group lookup выполнять tenant-scoped.
- Не разрешать manager назначить самого себя manager чужой группы.
- Не разрешать подмену Group ID из другого tenant.
- Проверить, что denied mutation не влияет на последующий доступ к:
  - users;
  - assignments;
  - progress;
  - reports.
- Обновить RBAC policy и документацию.
- Добавить security regression tests.

### Какие решения

**Authorization**

```text
admin:
  tenant-wide Group management

manager:
  read/manage members только существующей managed Group
  manager-set mutation запрещена

learner:
  Group management запрещён
```

Проверка должна выполняться относительно состояния **до mutation**.

Нельзя сначала добавить manager relation, а затем использовать появившийся scope как основание разрешения текущей операции.

Existing `ManagerTeamScope`/эквивалентный механизм необходимо сохранить и усилить object-level проверкой.

### Критерии готовности

- manager не может назначить себя manager чужой Group;
- manager не может изменить managers Group;
- manager не может изменить members неуправляемой Group;
- подмена Group ID не расширяет доступ;
- cross-tenant mutation запрещена;
- denied mutation не расширяет users/assignments/reports scope;
- admin сохраняет полный корректный Group management;
- exploit покрыт regression tests;
- RBAC documentation соответствует коду;
- lint, typecheck, tests и CI проходят.

---

## PR 267 — Разделить Group и Department

**Статус: реализовано.** Admin-страница `/admin/org-structure`, которая была UI-обёрткой над `Group`/`GroupMember`/`ManagerGroup`, но подписывалась как "Department"/"Organization structure" во всех локалях, переименована в `AdminGroupsPage` (`/admin/groups`); label'ы, i18n-ключи (`admin.groups.*`, `admin.nav.groups`) и модель (`admin-groups/model.ts`) приведены к терминологии `Group`. Group data/assignments/`GroupMember`/`ManagerGroup` не изменены — правился только UI-слой. Пикер пользователей для добавления member/manager заменён с client-side списка, молча обрезанного на первых 200 сотрудниках (`GET /users?pageSize=200`), на server-side поиск (`GET /users?search=`, добавлен в `UsersService.listUsers`) без ограничения по размеру организации. Полная пагинация самого списка Group (`GET /groups`, сейчас legacy-массив с `LEGACY_LIST_LIMIT=200`) сознательно вынесена за скобки этого PR как отдельная, более широкая миграция ответа API, затрагивающая других потребителей эндпоинта (`AdminAssignmentCompletionPage`).

### Задача

Устранить смешение понятий `Group` и `Department` в продукте и подготовить отдельный домен оргструктуры.

### Что необходимо сделать

- Зафиксировать, что `Group` остаётся учебной/операционной группой.
- Добавить отдельную продуктовую концепцию `Department`.
- В UI разделить:
  - `Groups`;
  - `Departments / Organization structure`.
- Убрать места, где существующая `Group` отображается пользователю как Department.
- Не мигрировать Group data в Department.
- Не использовать Group assignments как Department assignments.
- Не использовать `GroupMember` как `DepartmentMembership`.
- Не использовать `ManagerGroup` как `DepartmentManager`.
- Проверить UI при больших списках пользователей и групп.
- Использовать server-side search и pagination для списков более 200 элементов.
- Обновить i18n labels.

### Какие решения

`Group` и `Department` существуют параллельно.

```text
Group
  -> learning/operational grouping

Department
  -> formal organization structure
```

Навигация должна явно разделять эти разделы.

Автоматическая Group → Department migration запрещена, потому что одинаковое название не означает одинаковую бизнес-семантику.

### Критерии готовности

- Group не выдаётся за Department;
- Groups и Departments разделены в UI;
- существующие Group data не изменены;
- existing Group assignments работают как раньше;
- Department не строится поверх GroupMember;
- server-side search/pagination работает;
- i18n обновлён;
- существующие Group tests проходят;
- CI зелёный.

---

## PR 268 — Создать фундамент Department, DepartmentType и OrgStructureEvent

**Статус: реализовано.** Добавлены additive-first Prisma-модели и миграция с tenant-safe составными внешними ключами, уникальностью кодов и DB-level запретом self-parent; ограничения покрыты database integration tests.

### Задача

Создать базовую tenant-safe модель данных оргструктуры, на которой будут строиться все следующие PR.

### Что необходимо сделать

Создать `DepartmentType`.

Поля:

```text
id
organizationId
code
name
sortOrder
isActive
createdAt
updatedAt
```

Создать `Department`.

Поля:

```text
id
organizationId
parentId?
departmentTypeId?
name
code?
description?
sortOrder
status
directManagerMode
functionalManagerMode
archivedAt?
createdAt
updatedAt
```

Создать `OrgStructureEvent`.

Поля:

```text
id
organizationId
actorId?
entityType
entityId?
eventType
operationId
metadata
createdAt
```

Добавить индексы и DB constraints.

Проверить migrations:

- clean database;
- representative database до появления оргструктуры.

### Какие решения

#### DepartmentType

Тип подразделения tenant-configurable.

Нельзя hardcode уровни:

```text
Company
Department
Section
Team
```

Tenant сам определяет каталог типов.

Уникальность:

```text
UNIQUE (organizationId, code)
```

#### Department

Canonical hierarchy:

```text
Department.parentId -> Department.id
```

Self-parent запрещён на DB level.

Для nullable `code`:

```sql
CREATE UNIQUE INDEX departments_org_code_key
ON departments (organization_id, code)
WHERE code IS NOT NULL;
```

Критические relations должны иметь same-tenant DB defense, где это возможно.

#### OrgStructureEvent

Append-only domain history.

Event должен создаваться в той же transaction, что и domain mutation.

Не записывать в `metadata`:

- secrets;
- auth tokens;
- raw CSV;
- email lists;
- полный request body.

#### Миграции

Только additive-first.

Нельзя:

- переименовать Group в Department;
- переносить Group data автоматически;
- удалять существующие поля/таблицы.

После появления реальных org data rollback выполняется через application rollback + forward-fix, а не destructive DROP.

### Критерии готовности

- DepartmentType создан;
- Department создан;
- OrgStructureEvent создан;
- self-parent запрещён DB constraint;
- tenant/code uniqueness работает;
- cross-tenant critical relation невозможно создать;
- Department может существовать без DepartmentType;
- Group semantics не изменены;
- clean migration проходит;
- representative upgrade migration проходит;
- integration tests проходят;
- CI зелёный.

---

## PR 269 — Реализовать Department Tree API и безопасный reparent

**Статус: реализовано.** Добавлен backend-модуль `departments` с указанным API дерева/поиска/пути/move/archive/restore для `Department` и CRUD/archive/restore для `DepartmentType`; все endpoints admin-only (manager object-scope для Department не входит в этот PR и остаётся будущей задачей). Depth/cycle-проверки и построение пути реализованы через bounded `WITH RECURSIVE` CTE (guard-глубина 40, бизнес-лимит `MAX_DEPARTMENT_DEPTH=32`). Reparent (`move`) выполняется в Serializable-транзакции с bounded retry на serialization failure и до записи отклоняет self-move, cross-tenant/архивного родителя, цикл и превышение глубины — так что два одновременных встречных move (A→B и B→A) не могут оба закоммититься. Каждая мутация пишет `OrgStructureEvent` в той же транзакции (не best-effort, в отличие от `AuditLogService`). Юнит-тесты (моканый Prisma) покрывают все ветки валидации/отказа; добавлен также `apps/api/src/integration/departments-tree.database.spec.ts` с реальными Postgres recursive-CTE и обязательным конкурентным тестом двух встречных move — этот файл не мог быть выполнен локально в sandbox без доступного Postgres/Docker и будет запущен в CI job "Tests & database".

### Задача

Реализовать backend API для дерева подразделений, поиска, пути, перемещения, archive и restore.

### Что необходимо сделать

Создать backend module `departments`.

Реализовать API:

```text
GET    /api/v1/departments
GET    /api/v1/departments/tree
GET    /api/v1/departments/:id
GET    /api/v1/departments/:id/children
GET    /api/v1/departments/:id/path
POST   /api/v1/departments
PATCH  /api/v1/departments/:id
POST   /api/v1/departments/:id/move
POST   /api/v1/departments/:id/archive
POST   /api/v1/departments/:id/restore
```

Реализовать DepartmentType API:

```text
GET    /api/v1/department-types
POST   /api/v1/department-types
PATCH  /api/v1/department-types/:id
POST   /api/v1/department-types/:id/archive
POST   /api/v1/department-types/:id/restore
```

Реализовать:

- roots;
- lazy children;
- path;
- server search по name/code;
- ancestor path для search result;
- deterministic sibling sort;
- safe move;
- archive;
- restore.

### Какие решения

#### Tree

`GET /departments/tree` возвращает roots, а не всё дерево.

Children загружаются лениво.

Sort:

```text
sortOrder
name
id
```

#### Depth

```text
MAX_DEPARTMENT_DEPTH = 32
```

#### Reparent

Move выполняется в `Serializable` transaction.

Перед commit проверить:

- target Department same tenant;
- parent same tenant;
- parent active;
- parent != self;
- parent не descendant;
- результирующая максимальная глубина moved subtree <= 32.

При Prisma `P2034` — retry максимум 5 раз.

Обязательный concurrency test:

```text
A -> B
B -> A
```

Обе операции вместе не должны создать cycle.

#### Recursive queries

Использовать PostgreSQL recursive CTE.

#### Archive

Department нельзя архивировать при active child.

Полные lifecycle blockers будут дополнены в PR 280.

#### Restore

Проверить:

- parent существует;
- parent active;
- code uniqueness;
- cycle;
- depth.

Restore не должен автоматически реактивировать закрытые связи.

### Критерии готовности

- создаётся root Department;
- создаётся child Department;
- multiple roots работают;
- дерево 3+ уровней работает;
- roots/children/path/search работают;
- lazy loading bounded;
- depth >32 отклоняется;
- self move отклоняется;
- descendant move отклоняется;
- concurrent A↔B не создаёт cycle;
- cross-tenant move запрещён;
- archived parent нельзя выбрать;
- Department с active child нельзя архивировать;
- restore не реактивирует старые relations;
- mutation создаёт OrgStructureEvent атомарно;
- OpenAPI обновлён;
- integration tests и CI проходят.

---

## PR 270 — Реализовать Department Tree UI

**Статус: реализовано.** Добавлена новая admin-страница `/admin/departments` (`AdminDepartmentsPage`) поверх реального Department API из PR 269 — существующая `/admin/groups` (Group) не тронута, это отдельная сущность. Дерево реализовано как lazy `role="tree"`/`role="treeitem"` (без предзагрузки всего tenant tree), с expand/collapse, keyboard-навигацией (стрелки/Home/End/Enter), server-side поиском с раскрытием ancestor path через `GET /departments/:id/path`, и явно выделенным selected node. Реализованы create root/child, edit, move (с выбором нового родителя), archive/restore, а также управление `DepartmentType` (создание/архивирование/восстановление) без hardcoded списка типов. Managers/headcount колонки явно помечены как "coming soon" вместо fake-значений (до PR 273/274). Frontend API wrapper — `apps/web/src/shared/api/departments.ts`; UI-only tree-состояние — чистый reducer в `admin-departments/model.ts` (32 unit-теста), roots/types читаются напрямую из `useAsyncData`, без промежуточного React-эффекта. Добавлены E2E (`apps/e2e/tests/admin-departments.spec.ts`) и accessibility (`apps/e2e/accessibility-tests/accessibility.spec.ts`) тесты — оба требуют реального backend/Postgres и не могли быть выполнены локально в sandbox без Docker; будут проверены в CI. Visual regression baseline для этой страницы сознательно не добавлен в этом PR (см. `apps/e2e/visual-tests/README.md` — baseline должен генерироваться на CI-идентичном Chromium через `update-visual-baselines.yml`, не в этой sandbox-среде); существующие visual-снапшоты не затронуты. CSS-бюджет (`check-css-bundle.mjs`) увеличен 80 KiB → 84 KiB — предыдущий бюджет оставлял ~19 B запаса на весь остальной проект.

### Задача

Перевести административную страницу оргструктуры на реальный Department API.

### Что необходимо сделать

- Создать frontend API wrapper для Department.
- Перестать использовать Group API как источник Department UI.
- Реализовать дерево:
  - roots;
  - expand/collapse;
  - lazy children;
  - selected node;
  - search;
  - reveal ancestor path.
- Реализовать:
  - create root;
  - create child;
  - edit;
  - move;
  - archive;
  - restore.
- Реализовать управление DepartmentType.
- Добавить loading/error/empty states.
- Не отображать fake manager/users count до появления соответствующих backend API.
- Подготовить место для будущих columns:
  - managers;
  - headcount.
- Реализовать keyboard navigation и accessibility.
- Обновить i18n.
- Добавить frontend/E2E/visual tests.

### Какие решения

UI должен использовать lazy `tree`/`treegrid`, а не загружать весь tenant tree сразу.

При поиске найденный элемент должен раскрывать ancestor path.

UI не должен вычислять бизнес-агрегаты самостоятельно.

До PR 273/274 manager/headcount columns либо скрываются, либо находятся в явно disabled state без fake values.

DepartmentType не должен быть hardcoded в frontend.

### Критерии готовности

- UI использует только Department API;
- Group API не используется как Department source;
- дерево 3+ уровней отображается;
- lazy expand не требует full reload;
- search раскрывает ancestor path;
- create/edit/move/archive/restore работают;
- DepartmentType управляется без hardcoded levels;
- fake manager/headcount значения отсутствуют;
- ошибки backend отображаются корректно;
- i18n заполнен;
- keyboard/a11y tests проходят;
- visual regression проходит;
- CI зелёный.

---

## PR 271 — Реализовать DepartmentMembership и историю переводов

**Статус: реализовано.** Добавлена модель `DepartmentMembership` (историческая user↔department relation) и модуль `department-memberships` с указанным API: `GET departments/:id/users`, `GET users/:id/department-memberships`, `POST department-memberships`, `POST department-memberships/:id/close`, `POST users/:id/department-transfer`, `POST departments/:id/users/bulk-transfer` (лимит 500 пользователей per batch). Оба plan-инварианта — не более одного current primary membership на пользователя, и не более одного current membership на пару (пользователь, подразделение) — реализованы через partial unique indexes на уровне БД (raw SQL в миграции, как и `departments_org_code_key`), а не только в коде, поэтому concurrent primary race гарантированно не ломает инвариант (проверено выделенным database-integration тестом с двумя параллельными transfer). Transfer и bulk-transfer выполняются в Serializable-транзакции с bounded retry (тот же helper, что и для reparent из PR 269). Создание membership отклоняет archived department и inactive user до записи. Existing users не получают Department автоматически — миграция только создаёт таблицу, без backfill. Каждая мутация пишет `OrgStructureEvent` в той же транзакции. RBAC: `departmentMembershipsRead/Write`, admin-only (как и Department/DepartmentType в PR 269/270). `positionId` в модели сознательно не добавлен — зарезервировано для PR 275 согласно плану. `apps/api/src/app.module.ts` подключает новый модуль по уже задокументированному DI-паттерну (без изменения module boundaries), поэтому docs-impact для module-topology закрыт как `reviewed-no-change` в PR body, а не правкой `ARCHITECTURE_MODULE_BOUNDARIES.md`, который сознательно не ведёт ручной module inventory.

### Задача

Связать пользователей с подразделениями через историческую relation-модель.

### Что необходимо сделать

Создать `DepartmentMembership`.

Поля:

```text
id
organizationId
departmentId
userId
isPrimary
effectiveFrom
effectiveTo?
createdAt
updatedAt
```

Подготовить возможность добавить `positionId` в PR 275.

Реализовать API:

```text
GET  /api/v1/departments/:id/users
GET  /api/v1/users/:id/department-memberships
POST /api/v1/department-memberships
POST /api/v1/department-memberships/:id/close
POST /api/v1/users/:id/department-transfer
POST /api/v1/departments/:id/users/bulk-transfer
```

Поддержать:

- primary;
- additional;
- current/history;
- transfer;
- bulk transfer.

### Какие решения

Current relation:

```text
effectiveTo IS NULL
```

DB partial unique indexes:

```sql
CREATE UNIQUE INDEX department_memberships_current_primary_user_key
ON department_memberships (organization_id, user_id)
WHERE is_primary = TRUE AND effective_to IS NULL;
```

```sql
CREATE UNIQUE INDEX department_memberships_current_user_department_key
ON department_memberships (organization_id, user_id, department_id)
WHERE effective_to IS NULL;
```

Правила:

- максимум один current primary membership;
- additional не закрывает primary;
- duplicate current same Department запрещён;
- historical rows не редактируются обычным update;
- transfer = close old primary + create new primary + event;
- bulk transfer atomic;
- existing Users автоматически не распределяются;
- Group membership не преобразуется.

Bulk batch max:

```text
500 users
```

### Критерии готовности

- один current primary DB-enforced;
- additional memberships работают;
- duplicate current same Department запрещён;
- concurrent primary race не ломает invariant;
- transfer сохраняет историю;
- bulk transfer не оставляет partial state;
- cross-tenant User/Department relation невозможна;
- inactive User нельзя назначить в новую current relation;
- archived Department нельзя назначить;
- existing users не получили Department автоматически;
- event history пишется;
- integration tests и CI проходят.

---

## PR 272 — Реализовать DepartmentManager и наследование руководителей

**Статус: реализовано.** Добавлена модель `DepartmentManager` (DIRECT/FUNCTIONAL, с `isPrimary`, `effectiveFrom`/`effectiveTo`) и модуль `department-managers` с API: `GET departments/:id/managers` (effective set), `POST department-managers`, `POST department-managers/:id/close`, `PATCH departments/:id/manager-modes`. Оба plan-инварианта реализованы через partial unique indexes на уровне БД (raw SQL в миграции, как и `department_memberships`): не более одного current manager на (department, user, type), и не более одного current primary manager на (department, type) — проверено выделенным database-integration тестом с двумя параллельными primary-create для одного (department, type). LOCAL/INHERIT/MERGE вычисляются через forward DP по ancestor chain (root-first, переиспользует `getAncestorIdChain` из PR 269/270): INHERIT берёт effective set родителя как есть (что рекурсивно уже равно "ближайший effective ancestor" без отдельного поиска вверх), MERGE объединяет local ∪ inherited с dedupe по User (local побеждает), а local primary подавляет inherited primary в объединённом наборе. `source`/`sourceDepartmentId` в ответе вычисляются относительно запрошенного department (не фиксируются на момент вставки). `PATCH .../manager-modes` отклоняет переключение в INHERIT, пока существуют current local managers данного type (Serializable-транзакция с retry, чтобы не проиграть гонку с параллельным create) — общий update department (`PATCH /departments/:id`) больше не принимает поля режимов, только этот выделенный endpoint. Manager relation не требует Department membership и не выдаёт RBAC role `manager`. RBAC: `departmentManagersRead/Write`, admin-only (как и Department/DepartmentMembership).

### Задача

Поддержать несколько структурных и функциональных руководителей подразделения и вычисляемое наследование по дереву.

### Что необходимо сделать

Создать `DepartmentManager`.

Поля:

```text
id
organizationId
departmentId
userId
type
isPrimary
effectiveFrom
effectiveTo?
createdAt
updatedAt
```

Типы:

```text
DIRECT
FUNCTIONAL
```

Добавить для Department:

```text
directManagerMode
functionalManagerMode
```

Режимы:

```text
LOCAL
INHERIT
MERGE
```

Реализовать API:

```text
GET   /api/v1/departments/:id/managers
POST  /api/v1/department-managers
POST  /api/v1/department-managers/:id/close
PATCH /api/v1/departments/:id/manager-modes
```

### Какие решения

DB constraints:

- duplicate current Department+User+type запрещён;
- максимум один current primary manager каждого type.

Manager:

- active User;
- same tenant;
- не обязан иметь membership в Department;
- relation не назначает RBAC role `manager`.

#### LOCAL

Effective set = local current managers.

#### INHERIT

Искать вверх по ancestor chain ближайший Department, у которого effective set данного manager type непустой.

Использовать именно ближайший effective ancestor, а не объединять всех ancestors.

#### MERGE

```text
local managers
UNION
nearest inherited effective managers
```

Dedupe по User.

#### Primary

```text
local primary
-> inherited primary
-> null
```

API effective managers должен возвращать:

```text
source = LOCAL | INHERITED
sourceDepartmentId
```

При switch `LOCAL/MERGE -> INHERIT`, если существуют current local managers, вернуть conflict до их явного закрытия.

### Критерии готовности

- несколько DIRECT managers работают;
- несколько FUNCTIONAL managers работают;
- максимум один primary/type DB-enforced;
- duplicate current manager запрещён;
- concurrent primary race safe;
- LOCAL корректен;
- INHERIT работает минимум через 3 уровня;
- MERGE объединяет и dedupe managers;
- local primary имеет приоритет;
- inherited source виден в API;
- mode switch не скрывает молча local managers;
- manager relation не повышает RBAC;
- history/tests/CI проходят.

---

## PR 273 — Реализовать UI сотрудников и руководителей подразделения

**Статус: реализовано.** Department editor (`AdminDepartmentsPage`) теперь показывает и редактирует DIRECT/FUNCTIONAL managers: multi-select по каждому type, primary отдельно на type, LOCAL/INHERIT/MERGE selectors (через выделенный `PATCH .../manager-modes`, не через общий update), inherited manager визуально помечен бейджем "Унаследован от {department}" со ссылкой на исходное подразделение, закрытие local manager assignment. Дерево показывает manager summary badge (primary DIRECT manager name + "+N", local/inherited marker), лениво подгружаемый только для видимых узлов (тот же lazy-per-visible-node паттерн, что уже используется для children/type), плюс click-to-open popover с полным effective-набором. Создан отдельный `Department users` page (`/admin/departments/:id/users`): server-side search + pagination (backend `GET /departments/:id/users` расширен query-параметрами `search/page/pageSize` и теперь возвращает `PaginatedResponse`, было — plain array), таблица через `DataTable` с bulk-selection (только primary rows, так как transfer/bulk-transfer перемещают именно primary membership), Transfer (single/bulk), create/close additional membership, per-user history через `expansion`-раскрытие строки (`GET /users/:id/department-memberships`). DepartmentManager relation нигде не переиспользует RBAC `manager` badge/wording (`admin.roles.options.manager`) — только нейтральный `Badge` со своими `admin.departments.manager*` ключами. Position не показывается (задел на PR 275). i18n-ключи добавлены во все 4 локали (en/ru/kk/zh), parity проверена `i18n-hardening.spec.ts`. Frontend unit/vitest и backend jest/database suites зелёные локально; Browser E2E (`admin-department-managers.spec.ts`) написан, но не прогнан локально — в песочнице нет Redis/MinIO, необходимых для полного `pnpm test:e2e` стека. Изменения затрагивают global `admin.css`, layout детальной панели, дерево подразделений и его popover, что классифицируется как визуально значимые по `AGENTS.md`; `pnpm test:visual` в песочнице не запускался по той же причине (нет prod-стека), но CI job `Visual regression` на PR #747 прошёл зелёным (как и `Browser E2E`), это и есть обязательная проверка перед пометкой задачи выполненной. Добавленные/изменённые интерактивные элементы (accessible names у пикеров, keyboard-активация manager popover) требуют также `pnpm test:a11y`; локально не запускался (та же причина — нет prod-стека), но CI job `Accessibility` на PR #747 прошёл зелёным.

### Задача

Довести административный Department UI до полноценной работы с memberships и managers.

### Что необходимо сделать

В Department editor добавить:

- DIRECT managers multi-select;
- FUNCTIONAL managers multi-select;
- primary manager каждого type;
- `LOCAL/INHERIT/MERGE`;
- inherited source Department;
- закрытие current manager assignment.

В tree добавить manager summary:

- primary DIRECT manager;
- `Name + N`;
- details/popover;
- local/inherited marker.

Создать Department users page:

- server search;
- pagination;
- primary/additional;
- current/history;
- transfer;
- bulk transfer;
- create/close additional membership.

До PR 275 Position не показывать fake value.

Добавить confirmation/error flows.

### Какие решения

UI должен явно отделять:

```text
RBAC role manager
```

от:

```text
DepartmentManager relation
```

Inherited manager должен визуально отличаться от local manager.

Для lists >200 пользователей обязательно server-side search/pagination.

История membership доступна admin.

### Критерии готовности

- DIRECT/FUNCTIONAL managers назначаются через UI;
- primary manager каждого type выбирается отдельно;
- LOCAL/INHERIT/MERGE настраиваются;
- inherited manager визуально отличим;
- source Department отображается;
- users page работает при >200 users;
- Position не подделывается до PR 275;
- transfer/bulk/additional работают;
- history доступна;
- UI не выдаёт DepartmentManager за RBAC role;
- i18n/a11y/frontend/E2E tests проходят;
- CI зелёный.

---

## PR 274 — Реализовать headcount и bounded aggregation

**Статус: реализовано.** Добавлены `directUserCount` (current active primary membership, только этот Department) и `subtreeUserCount` (unique users, current active primary membership, Department + все descendants) во все read-эндпоинты Department: `GET /departments`, `GET /departments/tree`, `GET /departments/:id`, `GET /departments/:id/children`, `GET /departments/:id/path`. DB-side aggregation: `getDirectHeadcounts`/`getSubtreeHeadcounts` (`department-tree-queries.ts`) — один batched SQL-запрос на каждый вызов (`GROUP BY`/recursive CTE по всему запрошенному набору id), не per-department query; единая точка подключения — приватный `DepartmentsService.withHeadcounts`, чтобы будущая правка одного read-метода не могла случайно вернуть N+1. Additional (non-primary) membership, historical (closed) membership и inactive/archived User исключены прямо в SQL (не постфильтрацией). Индексы не добавлялись — уже существующие `@@index([organizationId, departmentId, effectiveTo])` (DepartmentMembership) и `@@index([organizationId, parentId, status, sortOrder])` (Department) покрывают join/filter без изменений схемы. Frontend: `Department.directUserCount`/`subtreeUserCount` — реальные backend-поля, без client-side агрегации; замененён fake-плейсхолдер "Headcount — coming soon" в `AdminDepartmentsPage` detail panel на прямой рендер обоих чисел. Database-integration тест (`department-headcounts.database.spec.ts`, реальный Postgres) проверяет: direct/subtree correctness, additional membership не даёт double-count, transfer меняет direct count обоих departments, reparent переносит subtree headcount новому предку без изменения direct count перемещённого узла, inactive user исключён даже если стал inactive уже после назначения, и что `getChildren` делает ровно 2 raw-запроса (не по одному на ребёнка) — явная проверка отсутствия N+1. Backend unit-тесты (`departments.service.spec.ts`) добавлены на смёрдживание полей и batching поверх мокнутого Prisma. E2E (`admin-departments.spec.ts`) расширен проверкой, что у только что созданного department оба счётчика читаются как `0`, а не placeholder-текст. Performance-benchmark под нагрузкой (representative dataset, `EXPLAIN ANALYZE`) — предмет отдельного PR 281 по плану, не этого PR.

### Задача

Реализовать корректную численность подразделений без double-count и N+1.

### Что необходимо сделать

Добавить в tree/read responses:

```text
directUserCount
subtreeUserCount
```

При необходимости:

```text
additionalMembershipCount
```

Реализовать DB-side aggregation.

Проверить изменения counts после:

- transfer;
- additional membership;
- reparent;
- archive;
- user disable/archive.

### Какие решения

`directUserCount`:

```text
current
active
primary memberships
только текущего Department
```

`subtreeUserCount`:

```text
unique users
current active primary memberships
Department + descendants
```

Additional membership не входит в основной headcount.

Historical membership исключается.

Inactive/archived User исключается.

Нельзя выполнять отдельный count query на каждый Department.

Не добавлять индексы «на всякий случай» — сначала получить query plan.

### Критерии готовности

- direct count корректен;
- subtree count корректен;
- additional membership не double-count;
- transfer меняет counts;
- reparent меняет subtree count;
- inactive/historical users исключены;
- tree UI использует backend counts;
- client-side aggregation отсутствует;
- critical path не имеет N+1;
- representative DB integration test проходит;
- CI зелёный.

---

## PR 275 — Реализовать Position

**Статус: реализовано.** Добавлена модель `Position` (tenant-scoped каталог должностей: `id`, `organizationId`, `code`, `title`, `description?`, `status`, `archivedAt?`) и модуль `positions` с API: `GET /positions`, `GET /positions/:id`, `POST /positions`, `PATCH /positions/:id`, `POST /positions/:id/archive`, `POST /positions/:id/restore` — сервис/контроллер зеркалируют существующий `DepartmentType` (code+title каталог, archive/restore), поля/enum — `Department` (status+archivedAt). Уникальность `UNIQUE(organizationId, code)` реализована как обычный `@@unique` (не partial index, в отличие от membership/manager инвариантов) и обеспечивается на уровне БД; P2002 маппится в `ConflictException`. `DepartmentMembership.positionId?` добавлен как nullable FK (`onDelete: NoAction`, тот же паттерн, что и `Department.departmentType`, — Position архивируется, а не удаляется, поэтому hard delete недостижим). Инвариант "архивная Position остаётся в истории, но не может быть назначена на новую current relation" реализован через `ensurePositionAssignable` — общий helper, вызываемый в `createMembership`, `transferPrimaryDepartment` и `bulkTransfer` (для bulk-transfer — одна проверка на весь batch, так как `positionId` в `bulkTransferSchema` — единое top-level поле для всей операции, а не per-user). Существующие исторические/current membership с уже назначенной Position не затрагиваются архивированием — `archivePosition` не трогает `department_memberships`. Legacy `User.position` не удалён и не бэкфиллится (зарезервировано для PR 276). RBAC: `positionsRead/Write`, admin-only (как и Department/DepartmentType/DepartmentMembership/DepartmentManager). Каждая мутация Position пишет `OrgStructureEvent` (`position.created/updated/archived/restored`) в той же транзакции. Backend unit-тесты (`positions.service.spec.ts`, `department-memberships.service.spec.ts`) и database-integration тест (`positions.database.spec.ts`: tenant-scoped duplicate code, archive/restore, историческая membership не ломается архивированием Position, новое назначение архивной Position отклоняется) — все зелёные локально против реального Postgres. Frontend: `apps/web/src/shared/api/positions.ts` (типы + wrapper-функции), `AdminPositionsPage` (`/admin/positions`, list/search/status-filter/pagination/create/edit/archive/restore, зарегистрирована в `getAdminNav()` под Settings и в `AdminRoutes.tsx`), Position-selector (optional, только active positions) добавлен в диалоги "Add additional membership" и "Transfer" на `AdminDepartmentUsersPage`. i18n-ключи добавлены во все 4 локали (en/ru/kk/zh), parity проверена `i18n-hardening.spec.ts`. Frontend unit/vitest (coverage выше порога 40% functions) и backend jest/database suites зелёные локально; `pnpm --filter @lms/web build` и CSS-бюджет (`check-css-bundle.mjs`, 84 KiB) проходят. Browser E2E: Position CRUD (create/edit/archive/restore) и Position-selector в membership/transfer UI встроены в существующий `admin-department-managers.spec.ts` тест, а не оформлены отдельным файлом — отдельный `admin-positions.spec.ts` с собственным admin-логином изначально был добавлен, но первый прогон CI показал, что он выталкивает shared account-level login rate limit (5 логинов/минуту) за предел, из-за чего начал флейкать `instructor-workspace.spec.ts` (его внутренний admin-логин через `createForeignCourse` попадал уже в исчерпанное окно); тест был слит в уже существующий admin-flow спек без дополнительного логина, следуя задокументированному в PR 273 паттерну "one test, one admin login". Не мог быть прогнан локально в этой sandbox-среде — нет Redis/MinIO для полного `pnpm test:e2e` стека; проверено зелёным в CI job "Browser E2E" после фикса.

### Задача

Нормализовать должности в отдельный tenant-scoped каталог и связать их с DepartmentMembership.

### Что необходимо сделать

Создать `Position`.

Поля:

```text
id
organizationId
code
title
description?
status
archivedAt?
createdAt
updatedAt
```

Добавить:

```text
DepartmentMembership.positionId?
```

Реализовать API:

```text
GET   /api/v1/positions
GET   /api/v1/positions/:id
POST  /api/v1/positions
PATCH /api/v1/positions/:id
POST  /api/v1/positions/:id/archive
POST  /api/v1/positions/:id/restore
```

Создать admin UI:

- list;
- search;
- create;
- edit;
- archive;
- restore.

Добавить Position selector в membership/transfer UI.

### Какие решения

Уникальность:

```text
UNIQUE (organizationId, code)
```

Current position пользователя определяется Position его current primary membership.

Historical membership хранит historical Position.

Additional membership может иметь отдельную Position.

Archived Position:

- остаётся в history;
- не может назначаться в новую current relation.

Legacy `User.position` в этом PR не удаляется и не backfill-ится автоматически.

### Критерии готовности

- Position tenant-scoped;
- duplicate code запрещён внутри tenant;
- current primary membership содержит Position;
- historical Position сохраняется;
- additional membership может иметь Position;
- archived Position нельзя назначить;
- `User.position` не удалён;
- Position UI/search/selectors работают;
- DB/frontend tests и CI проходят.

---

## PR 276 — Безопасно мигрировать legacy User.position

**Статус: реализовано.** Добавлены два CLI-скрипта без HTTP-эндпоинта (как `session:cleanup`/`storage:cleanup`): `pnpm --filter @lms/api positions:legacy-inventory` (read-only отчёт — различные значения `User.position` после trim+NFC+case-fold нормализации ТОЛЬКО для группировки одинаковых по написанию строк, их исходные написания, счётчики по организациям, текущий mapping-статус) и `pnpm --filter @lms/api positions:migrate-legacy` (dry-run по умолчанию, `--apply` для реальной записи). Explicit mapping `legacy value -> Position code` живёт в `apps/api/src/scripts/migrate-legacy-positions.mapping.ts` (пустой по умолчанию, заполняется человеком после просмотра inventory-отчёта) с двумя действиями на значение — `map` (на существующий `code`; скрипт **никогда не создаёт Position**) и `skip` (с обязательной `reason`, чтобы отличать "ещё не решили" от "решили не переносить"); конфликтующие записи на одну нормализованную строку помечаются `ambiguous` и не применяются. На пользователя: нет mapping-записи → `unresolved`; Position с данным `code` отсутствует в организации пользователя или архивирован → `unresolved` (архивная Position не может быть вновь назначена — тот же инвариант PR 275); нет текущего primary `DepartmentMembership` → `unresolved`, membership не создаётся; membership уже указывает на этот же Position → `mapped`/`alreadyApplied: true`, ничего не пишется; membership уже указывает на **другой** Position → `skipped` (не перезаписывается explicit-решение, сделанное вручную после PR 275); иначе — при `--apply` `positionId` проставляется и пишется `OrgStructureEvent` (`department_membership.legacy_position_migrated`) в той же транзакции. `User.position` не читается на запись ни на одном шаге — сохраняется как есть. Повторный `--apply` идемпотентен (не создаёт дублирующих событий/Position, не меняет уже мигрированные или уже вручную назначенные membership) — проверено `legacy-position-migration.database.spec.ts` (apply → apply → идентичное состояние) на реальном Postgres, плюс исчерпывающие unit-тесты (`legacy-position-migration.service.spec.ts`, `legacy-position-migration.types.spec.ts`) на мокнутом Prisma. Prisma-схема не менялась (`DepartmentMembership.positionId` уже существовал с PR 275) — новой миграции БД нет. Rollback/forward-fix задокументирован в новом `docs/runbooks/LEGACY_POSITION_MIGRATION.md` (откат данных через `OrgStructureEvent`-аудит, а не схема-rollback).

### Задача

Перенести существующие строковые должности в `Position`/`DepartmentMembership.positionId` без потери данных и без автоматического угадывания.

### Что необходимо сделать

1. Собрать inventory всех non-empty `User.position`.
2. Подготовить normalization report.
3. Выделить distinct values.
4. Создать explicit mapping:

```text
legacy value -> Position code
```

5. Отметить:
   - mapped;
   - unresolved;
   - ambiguous;
   - skipped.
6. Реализовать dry-run.
7. Реализовать idempotent apply.
8. Подготовить validation report.
9. Документировать rollback/forward-fix.

### Какие решения

Допускается normalization только для анализа:

- trim;
- Unicode normalization;
- case-insensitive comparison.

Но нельзя автоматически считать похожие строки одной должностью.

Mapping должен быть явным.

Для пользователя с current primary DepartmentMembership:

```text
membership.positionId = mapped Position
```

Для пользователя без current primary Department:

- не создавать искусственный membership;
- оставить запись unresolved.

Исходный `User.position` сохраняется.

Повторный apply не должен создавать duplicate Position или менять уже корректно mapped records.

### Критерии готовности

- каждая legacy строка учтена;
- ambiguous values видимы;
- автоматического merge неоднозначных значений нет;
- dry-run ничего не пишет;
- apply idempotent;
- mapped user с Department получает positionId;
- user без Department не получает fake membership;
- unresolved report полный;
- исходный `User.position` сохранён;
- rollback/forward-fix документирован;
- migration tests и CI проходят.

---

## PR 277 — Интегрировать Department и Position с LMS targeting

**Статус: реализовано.** `Assignment` расширен `departmentId?`/`includeDescendants` (ровно один target из `userId`/`groupId`/`departmentId` — обеспечено и Zod-refine, и DB CHECK `num_nonnulls(...)=1`; попутно удалён устаревший `assignments_single_target_check` из исходной миграции `20260526090000_add_assignments`, который требовал ровно одного из `user_id`/`group_id` и отклонял бы любую department-only строку; добавлен также CHECK `department_id IS NOT NULL OR include_descendants = false`). Добавлена модель `PositionCourse` (`organizationId`, `positionId`, `courseId`, `requirement: REQUIRED|OPTIONAL`, `dueDays? 0..3650`, `status`, `archivedAt?`) с `UNIQUE(organizationId, positionId, courseId)`, переиспользует `PositionStatus`; новый модуль `position-courses` (admin-only CRUD+archive/restore, `positionCoursesRead/Write`) никогда не создаёт Position/Course. Реализован `LearningTargetResolverService` (новый `@Global()`-модуль `learning-targets`, по образцу `ManagerTeamScopeModule` — иначе Nest DI не резолвит его в default-параметре консьюмера) — резолвит для (user, course) полный `sources[]` (`DIRECT_ASSIGNMENT`/`GROUP`/`DEPARTMENT`/`POSITION`/`SELF_ENROLLMENT`) заново при каждом вызове (без кеша/отдельного entitlement-состояния — потеря одного source никогда не отбирает доступ, если есть другой), effective requirement (`REQUIRED` побеждает `OPTIONAL`), effective due (минимальная non-null дата среди источников победившего tier), display source по фиксированному приоритету (`DIRECT_ASSIGNMENT > DEPARTMENT > GROUP > POSITION > SELF_ENROLLMENT`), с dedupe по `(type, id)`. Department source учитывает только current active primary `DepartmentMembership` (additional membership не участвует); `includeDescendants` резолвится через существующий `isSelfOrDescendant` recursive-CTE (экспортирован из `departments/public.ts`) — эффект **динамический**: reparent department немедленно меняет audience без изменения самой Assignment-строки (покрыто database-тестом). Position source: due date = `membership.effectiveFrom + dueDays` (решение зафиксировано как "с момента занятия должности", а не от createdAt requirement-записи). `ProgressService.ensureLearnerCanRecordProgress` переведён на единый resolver (принимает любой найденный source, вне зависимости от REQUIRED/OPTIONAL — self-enrollment остаётся доступным как раньше). Backend: исчерпывающие unit-тесты (`learning-target-resolver.types.spec.ts`, `learning-target-resolver.service.spec.ts`, `position-courses.service.spec.ts`, обновлённые `assignments.service.spec.ts`/`progress.service.spec.ts`) и database-integration тест (`learning-targets.database.spec.ts`: реальный recursive-CTE subtree match, reparent меняет audience, additional-membership исключение, PositionCourse uniqueness, потеря одного source не убирает entitlement при другом, both CHECK constraints на реальном Postgres) — все зелёные локально. Frontend: `AdminAssignmentCompletionPage` получил третий target — Department (с чекбоксом "Include sub-departments"); новая страница `AdminPositionCoursesPage` (`/admin/position-courses`, list/create/toggle-requirement/archive/restore) и `shared/api/position-courses.ts`; i18n на все 4 локали. `pnpm docs:generate` — 4 generated файла обновлены; `API_RBAC_MATRIX.md` и `MIGRATION_BACKUP_POLICY.md` дополнены вручную; `ARCHITECTURE_MODULE_BOUNDARIES.md`/`API_CONTRACTS.md` — `reviewed-no-change` (новые модули следуют уже описанным правилам, новой общей семантики контракта не вводится).

### Задача

Добавить Department и Position как источники назначения обучения и централизовать learner eligibility.

### Что необходимо сделать

Расширить существующий `Assignment`.

Добавить:

```text
departmentId?
includeDescendants Boolean
```

Target должен быть ровно один:

```text
userId
groupId
departmentId
```

Добавить `PositionCourse`.

Поля:

```text
id
organizationId
positionId
courseId
requirement
dueDays?
status
archivedAt?
createdAt
updatedAt
```

Requirement:

```text
REQUIRED
OPTIONAL
```

Реализовать `LearningTargetResolver`.

Перевести существующие consumers learner eligibility на единый resolver.

Не удалять существующие User/Group assignments.

### Какие решения

#### Assignment

После preflight existing data добавить DB constraint:

```sql
CHECK (num_nonnulls(user_id, group_id, department_id) = 1);
```

Если `departmentId IS NULL`, `includeDescendants` должен быть false.

Department target использует только current active primary memberships.

Additional membership не участвует.

`includeDescendants=true` означает current subtree и является динамическим: reparent изменяет будущую audience.

#### PositionCourse

Уникальность:

```text
organizationId + positionId + courseId
```

`dueDays`:

```text
0..3650
```

#### LearningTargetResolver

Источники:

```text
DIRECT_ASSIGNMENT
GROUP
DEPARTMENT
POSITION
SELF_ENROLLMENT
```

Effective requirement:

```text
REQUIRED > OPTIONAL
```

Effective due:

```text
самая ранняя non-null due date
внутри победившего requirement tier
```

Display source precedence:

```text
DIRECT_ASSIGNMENT
DEPARTMENT
GROUP
POSITION
SELF_ENROLLMENT
```

Но resolver обязан вернуть полный `sources[]`.

Если один source исчез, entitlement остаётся, если есть другой.

Existing Progress/Certificate history не удаляется.

Новый progress write требует current entitlement.

### Критерии готовности

- User assignment не сломан;
- Group assignment не сломан;
- Department direct target работает;
- Department subtree target работает;
- user вне subtree не получает target;
- additional-only membership не получает Department target;
- PositionCourse REQUIRED/OPTIONAL работает;
- overlapping sources dedupe;
- конфликт requirement/due/source детерминирован;
- удаление одного source не снимает entitlement при другом;
- existing Progress не повреждается;
- ProgressService использует общий resolver;
- reparent semantics покрыты tests;
- DB/frontend/integration tests и CI проходят.

---

## PR 278 — Реализовать OrganizationScope, RBAC и Department reports

**Статус: реализовано.** Добавлен `OrganizationAccessScopeService` (`apps/api/src/modules/organization-access-scope/`) — центральный object-scope сервис, объединяющий существующий ManagerGroup scope (делегируется в `ManagerTeamScope`) с scope из текущих (`effectiveTo IS NULL`) буквальных `DepartmentManager`-строк типа `DIRECT` (никогда `FUNCTIONAL` — он остаётся metadata-only и не расширяет data scope) плюс все потомки управляемого Department (через новый `getSubtreeDepartmentIds`, экспортированный из `departments/public.ts`, — та же CTE-конвенция, что и у существующих subtree-запросов). Effective users вычисляются исключительно из текущих **primary** membership — additional membership не расширяет scope. `DepartmentManager` сам по себе не выдаёт RBAC-роль `manager`: ролевая проверка (`RolesGuard`) и object-scope проверка (`OrganizationAccessScopeService`) полностью независимы. Существующий tenant-level guard (`OrganizationScopeGuard`) не тронут и остаётся отдельным слоем ниже по стеку. `ManagerService.getTeamSummary`/`sendOverdueReminders` переведены с `ManagerTeamScope` на `OrganizationAccessScopeService`, поэтому "моя команда" теперь означает Group ∪ Department DIRECT (∪ ReportingLine после PR 279), а не только Group. `ReportsService.getSummary` без Department-фильтра сознательно оставлен на старом `ManagerTeamScope`-пути без изменений (явное требование плана "без Department filter existing behavior не меняется"); с фильтром (`GET /reports/summary?departmentId=&includeDescendants=`) population запрошенного Department (+ поддерево, если `includeDescendants=true`) **пересекается** (`AND`) с `OrganizationAccessScopeService`, поэтому запрос sibling- или foreign-tenant Department естественно резолвится в пустую выборку, а не в ошибку или утечку данных; несуществующий в тенанте `departmentId` возвращает 404. `GET /reports/admin-dashboard` не изменён (admin-only, tenant-wide, manager scope там никогда не применялся). Authorization regression matrix на два реальных tenant реализована в `apps/api/src/integration/organization-access-scope.database.spec.ts` (real Postgres): DepartmentManager без роли manager не даёт scope; DIRECT-менеджер получает ровно managed subtree и не видит sibling-ветку; foreign tenant закрыт даже для того же userId; FUNCTIONAL и additional membership не расширяют scope; Group+Department scope объединяется с dedupe (пользователь в обеих ветках возвращается один раз); Department direct/subtree reports работают, а filterless reports не меняются; несуществующий departmentId — 404. Frontend не менялся в этом PR — `GET /reports/summary` остаётся обратно совместимым без query-параметров, а UI-селектор Department для `AdminResultsCertificatesPage` сознательно отложен как последующая (не блокирующая RBAC-архитектуру) задача. Backend unit (`organization-access-scope.service.spec.ts`, обновлённые `manager.service.spec.ts`/`reports.service.spec.ts`) и database-integration suites зелёные локально против реального Postgres; `tsc --noEmit`, `eslint`, `architecture:check` и `CI=true node scripts/check-critical-coverage.mjs` проходят без регрессий.

### Задача

Связать орготношения с фактическим manager read/report scope, не смешивая RBAC и relation semantics.

### Что необходимо сделать

Создать central object-scope service:

```text
OrganizationAccessScopeService
```

или эквивалент с тем же назначением.

Сохранить существующий tenant-level guard отдельно.

Объединить manager scope из:

- ManagerGroup;
- DepartmentManager DIRECT;
- ReportingLine DIRECT после PR 279.

Добавить Department filters в существующие reports:

```text
departmentId
includeDescendants
```

Добавить authorization regression matrix минимум для двух tenant.

### Какие решения

#### Admin

```text
tenant-wide
```

#### Department manager scope

Пользователь получает Department user/report scope только при одновременном выполнении:

```text
RBAC role = manager
AND
current DepartmentManager.type = DIRECT
```

Scope:

```text
managed Department
+
descendants
```

Effective users:

```text
current active primary memberships
```

#### FUNCTIONAL

По умолчанию metadata-only.

Не расширяет user/report scope.

#### Additional membership

Не расширяет manager scope.

#### Existing Group scope

Сохраняется.

Final effective manager users:

```text
Group scope
UNION
Department scope
UNION
ReportingLine scope
```

Dedupe обязателен.

Orgstructure write operations остаются admin-only.

#### Reports

Без Department filter existing behavior не меняется.

С Department filter population строится из current primary memberships.

Manager result:

```text
requested report population
INTERSECT
OrganizationAccessScope
```

Для breadcrumbs manager может видеть minimal ancestor metadata, но не ancestor users/reports.

### Критерии готовности

- DepartmentManager сам по себе не выдаёт RBAC manager;
- DIRECT + manager role даёт только разрешённый subtree;
- FUNCTIONAL не расширяет data scope;
- sibling branch закрыта;
- foreign tenant закрыт;
- ManagerGroup scope сохранён;
- overlap Group+Department dedupe;
- additional membership не расширяет scope;
- manager не может менять источник собственного org scope;
- Department direct/subtree reports работают;
- reports без filter не изменены;
- RBAC matrix обновлена;
- двухtenant authorization tests проходят;
- CI зелёный.

---

## PR 279 — Реализовать ReportingLine

### Задача

Добавить персональные линии подчинения отдельно от Department tree и интегрировать DIRECT reporting relation в manager scope.

### Что необходимо сделать

Создать `ReportingLine`.

Поля:

```text
id
organizationId
employeeId
managerId
type
isPrimary
effectiveFrom
effectiveTo?
createdAt
updatedAt
```

Типы:

```text
DIRECT
FUNCTIONAL
PROJECT
```

Реализовать API:

```text
GET   /api/v1/users/:id/reporting-lines
GET   /api/v1/users/:id/effective-manager
POST  /api/v1/reporting-lines
PATCH /api/v1/reporting-lines/:id
POST  /api/v1/reporting-lines/:id/close
```

Добавить UI в профиль пользователя.

Интегрировать DIRECT relation в OrganizationAccessScope.

### Какие решения

DB partial uniqueness:

- duplicate current employee+manager+type запрещён;
- максимум один current primary manager для employee/type.

Запретить:

```text
employeeId == managerId
```

DIRECT chain не может иметь cycle.

Cycle проверяется recursive CTE внутри concurrency-safe transaction.

Effective personal DIRECT manager:

```text
current primary DIRECT ReportingLine
->
primary effective DIRECT DepartmentManager
->
null
```

Manager read scope через ReportingLine:

```text
RBAC role manager
+
current DIRECT relation
```

Учитываются direct и transitive DIRECT reports.

FUNCTIONAL/PROJECT не расширяют data scope по умолчанию.

Department tree при этом не изменяется.

### Критерии готовности

- DIRECT relation работает;
- FUNCTIONAL relation хранится отдельно;
- PROJECT relation хранится отдельно;
- self-manager запрещён;
- DIRECT cycle запрещён;
- concurrent operations не создают cycle;
- primary uniqueness работает;
- effective manager fallback на Department работает;
- DIRECT ReportingLine scope требует RBAC manager;
- FUNCTIONAL/PROJECT не расширяют data scope;
- overlap всех scope sources dedupe;
- cross-tenant relation невозможна;
- event/history сохраняются;
- tests и CI проходят.

---

## PR 280 — Реализовать импорт, lifecycle и полную историю

### Задача

Сделать оргструктуру пригодной для реального администрирования: безопасный CSV import, archive/restore и полная история критических изменений.

### Что необходимо сделать

Реализовать Department CSV import.

Колонки:

```csv
code,name,parentCode,typeCode,sortOrder,directManagerMode,functionalManagerMode,directManagerUserIds,functionalManagerUserIds
```

Реализовать Membership CSV import.

Колонки:

```csv
userId,departmentCode,membershipType,positionCode,effectiveFrom
```

Pipeline:

```text
upload
parse
normalize
validate
preview
commit
transactional apply
post-validation
```

Поддержать modes:

```text
CREATE_ONLY
UPSERT
```

Реализовать UI preview/commit.

Расширить archive/restore lifecycle.

Довести `OrgStructureEvent` до полного покрытия критических mutations.

Добавить history UI.

### Какие решения

#### CSV bounds

```text
UTF-8
max 5 MiB
max 10 000 data rows
max 32 columns
max field 2048 chars
```

#### Preview

Preview не изменяет domain data.

После validation сервер:

- сохраняет exact normalized validated payload;
- создаёт случайный opaque token не менее 32 bytes;
- хранит SHA-256 token;
- связывает preview с:
  - organization;
  - actor;
  - import kind;
  - mode;
- TTL = 30 минут;
- token single-use.

Commit применяет сохранённый payload, а не повторно присланный CSV.

#### CREATE_ONLY

Existing canonical entity/relation = conflict.

Повтор не должен создавать duplicates.

#### UPSERT

Пустое optional поле:

```text
не менять существующее значение
```

Явное очищение:

```text
__CLEAR__
```

Явный move Department в root:

```text
parentCode = __ROOT__
```

Отсутствие строки не означает delete/close.

Implicit destructive synchronization запрещён.

#### Validation

Проверять:

- duplicate code;
- duplicate row intent;
- unknown parent;
- cycle;
- depth;
- archived/unknown type;
- manager mode;
- unknown/inactive managers;
- duplicate managers;
- >1 primary manager/type;
- unknown/inactive user;
- unknown/archived Position;
- primary membership conflicts;
- cross-tenant;
- dates;
- file/row bounds.

Department graph нужно валидировать как результирующее состояние всего файла, поэтому parent может находиться ниже child row.

#### Department archive

Блокировать при:

- active children;
- current memberships;
- current local managers;
- active Department assignments.

#### Restore

Повторно проверить:

- parent;
- code;
- cycle;
- depth;
- type.

Не реактивировать автоматически:

- memberships;
- managers;
- assignments.

#### Position archive

Блокировать, если:

- current membership использует Position;
- существует active PositionCourse.

#### User lifecycle

Disabled/archived User:

- history не удаляется;
- не входит в current headcount;
- inactive manager не расширяет scope;
- нельзя назначить в новую current relation;
- existing relation автоматически не удалять;
- effective resolver фильтрует inactive User.

#### History

Event для:

- Department create/update/move/archive/restore;
- membership create/close/transfer;
- manager create/close/mode;
- Position;
- ReportingLine;
- import;
- external mapping.

### Критерии готовности

- preview показывает ошибки до записи;
- invalid import не создаёт partial data;
- preview/commit tampering невозможен;
- expired token отклоняется;
- token другого actor/tenant отклоняется;
- concurrent commit одного token даёт один success;
- CREATE_ONLY повтор не создаёт duplicate;
- UPSERT semantics детерминированы;
- multi-level tree импортируется;
- child-before-parent поддерживается;
- manager/membership conflicts диагностируются;
- oversized input отклоняется;
- archive не делает destructive cascade;
- restore не возвращает скрытые relations/targets;
- inactive users/managers не влияют на effective results;
- каждая критическая mutation имеет event;
- history tenant-scoped;
- raw CSV/secrets не попадают в events/logs;
- integration/E2E/docs/CI проходят.

---

## PR 281 — Performance verification и условная оптимизация иерархии

### Задача

Проверить, что adjacency-list + recursive CTE выдерживает реальную нагрузку. Оптимизировать storage только при доказанном bottleneck.

### Что необходимо сделать

Создать representative dataset:

```text
2 tenants
1 000 Departments
10 000 Users
12 000 current memberships
depth >= 8
multiple roots
wide sibling level
multiple DIRECT/FUNCTIONAL managers
Department assignments
Position requirements
ReportingLine data
report data
```

Измерить:

- roots;
- lazy children;
- search;
- path;
- direct headcount;
- subtree headcount;
- effective manager resolution;
- OrganizationAccessScope;
- LearningTargetResolver;
- Department assignment audience;
- reports;
- CSV preview/commit.

Снять `EXPLAIN (ANALYZE, BUFFERS)` для critical SQL.

Проверить N+1.

### Какие решения

До benchmark фиксируются thresholds:

| Операция | p95 |
|---|---:|
| roots | <=300 ms |
| lazy children | <=250 ms |
| search | <=400 ms |
| path | <=250 ms |
| headcount | <=500 ms |
| effective managers | <=300 ms |
| access scope | <=400 ms |
| learner/course resolution | <=250 ms |
| Department report | <=750 ms |
| assignment audience | <=1000 ms |
| CSV preview 10k | <=10 s |
| CSV commit 10k | <=20 s |

Существующий repository baseline также не должен критически ухудшиться.

Если adjacency + CTE проходит gate:

```text
optimization = NOT REQUIRED
```

Если bottleneck доказан:

1. benchmark `DepartmentClosure`;
2. benchmark PostgreSQL `ltree`;
3. сравнить read/write/reparent/migration cost;
4. выбрать измеримо лучший вариант;
5. `Department.parentId` оставить canonical source;
6. projection добавить additive-first;
7. backfill;
8. dual-verify;
9. переключить только нужные reads;
10. иметь rollback reads на adjacency.

Major Prisma upgrade только ради hierarchy storage запрещён.

### Критерии готовности

- thresholds записаны до benchmark;
- representative dataset соответствует плану;
- baseline измерен;
- critical queries имеют EXPLAIN evidence;
- critical N+1 отсутствует;
- responses bounded;
- если bottleneck отсутствует — оптимизация не добавлена;
- если projection добавлен — он измеримо лучше;
- adjacency остаётся canonical;
- clean и upgrade migrations проверены;
- security matrix повторно проходит;
- E2E/a11y/i18n/visual pass выполнен;
- CI зелёный.

---

## PR 282 — Observability и operational diagnostics

### Задача

Добавить эксплуатационную наблюдаемость оргструктуры без PII и high-cardinality telemetry.

### Что необходимо сделать

Использовать существующий metrics registry проекта.

Добавить минимум:

```text
lms_org_department_tree_query_duration_seconds
lms_org_scope_resolution_duration_seconds
lms_org_learning_target_resolution_duration_seconds
lms_org_report_query_duration_seconds
lms_org_import_rows_total
lms_org_import_failures_total
lms_org_reparent_conflicts_total
```

Добавить structured diagnostics для:

- failed reparent;
- cycle/depth conflict;
- import validation/commit failure;
- scope resolution failure/deny;
- DB constraint conflict.

### Какие решения

Не создавать отдельный monitoring stack.

Продолжать существующий prefix:

```text
lms_
```

Duration:

```text
seconds
```

Counters:

```text
_total
```

Metrics labels могут содержать только bounded enums.

Запрещены как labels:

- User ID;
- email;
- Department ID;
- Department name/code;
- tenant-generated arbitrary values;
- external ID;
- CSV filename;
- arbitrary error string.

Не логировать:

- raw CSV;
- preview token/hash;
- auth token;
- secrets;
- полный request body;
- лишние персональные данные.

Для diagnostics использовать bounded reason codes.

Observability не должна менять authorization/domain semantics.

### Критерии готовности

- critical org metrics публикуются;
- labels low-cardinality;
- PII identifiers отсутствуют;
- raw import content/secrets отсутствуют в logs;
- reparent/import/scope failures диагностируются;
- success/error paths покрыты tests;
- instrumentation не меняет business behavior;
- operational docs обновлены;
- lint/typecheck/tests/build/CI проходят.

---

## PR 283 — External identifiers и готовность к HRIS/SCIM

### Задача

Подготовить доменную модель к будущим внешним кадровым интеграциям, не реализуя сам connector.

### Что необходимо сделать

Создать `OrgExternalReference`.

Поля:

```text
id
organizationId
entityType
entityId
sourceSystem
externalId
createdAt
updatedAt
```

Initial entity types:

```text
DEPARTMENT
DEPARTMENT_TYPE
POSITION
```

Реализовать tenant-scoped resolution service.

При необходимости интегрировать lookup в approved admin/import flow.

Подготовить migration/integration tests.

### Какие решения

Internal UUID остаётся canonical primary key.

External ID не используется как FK внутренних domain tables.

Уникальность:

```text
organizationId
+ sourceSystem
+ entityType
+ externalId
```

Одна internal entity может иметь references из разных source systems.

`sourceSystem`:

```text
1..64 chars
normalized lowercase slug
```

`externalId`:

```text
1..255 chars
case-exact
```

Archive entity не удаляет historical external mapping.

External reference не может реактивировать archived entity.

Обычный UPSERT не должен молча remap external ID на другую internal entity.

USER external reference не добавляется, пока не согласован с существующим User integration contract.

В этот PR не входят:

- SCIM endpoint;
- HRIS polling;
- webhook sync;
- background sync;
- destructive reconciliation.

### Критерии готовности

- internal UUID не заменён external ID;
- mapping tenant-scoped;
- duplicate external ID одного source/entity type запрещён;
- cross-tenant resolution невозможен;
- одна entity может иметь разные source mappings;
- archive сохраняет mapping history;
- external reference не обходит domain validation;
- import может использовать только явно approved mapping;
- connector не реализован в рамках PR;
- migration/integration tests проходят;
- CI зелёный.

---

## PR 284 — Финальная интеграционная проверка и release gate

### Задача

Проверить модуль как единую систему после реализации PR 266–283 и подтвердить готовность к release.

Это отдельный verification PR. Он не должен смешивать финальную проверку с разработкой новой функциональности.

### Что необходимо сделать

#### Проверить database rollout

Clean DB:

- применяются все migrations;
- custom SQL;
- partial indexes;
- tenant constraints;
- self-parent constraint;
- exactly-one Assignment target constraint.

Representative upgrade DB:

- существующие Organization/User/Group/Assignment/Progress data сохранены;
- legacy `User.position` сохранён;
- новые таблицы корректны;
- invalid current duplicates не возникают.

Проверить невозможность:

- invalid hierarchy cycles;
- duplicate current primary membership;
- duplicate current primary DepartmentManager/type;
- duplicate current primary ReportingLine/type;
- cross-tenant relations.

#### Проверить security минимум на двух tenant

Actors:

- admin;
- DIRECT Department manager;
- FUNCTIONAL Department manager;
- DIRECT ReportingLine manager;
- Group-only manager;
- manager с overlap Group+Department+ReportingLine;
- sibling manager;
- learner;
- foreign-tenant actor.

Обязательно повторить exploit regression PR 266.

#### Проверить E2E

Admin flow:

- DepartmentType;
- multi-level tree;
- move/reorder;
- archive/restore;
- memberships;
- transfers;
- additional memberships;
- managers;
- manager inheritance;
- Position;
- legacy position migration;
- ReportingLine;
- Department Assignment;
- PositionCourse;
- import preview/commit;
- history;
- external references.

Manager flow:

- видит только разрешённый effective scope;
- Group scope работает;
- Department scope работает;
- ReportingLine scope работает;
- overlaps dedupe;
- sibling/foreign data закрыты;
- не может менять источники собственного scope.

Learner flow:

- direct assignment;
- Group assignment;
- Department assignment;
- PositionCourse;
- overlapping sources;
- requirement/due policy;
- entitlement removal semantics;
- progress history сохранена.

#### Проверить lifecycle

- archived Department;
- restored Department;
- archived Position;
- disabled/archived User;
- inactive manager;
- restore не создаёт скрытые relations или training targets.

#### Проверить frontend

- tree reference-level UX;
- >200 users;
- server search/pagination;
- loading/error/empty;
- manager inheritance display;
- accessibility;
- keyboard;
- i18n;
- visual regression.

#### Проверить performance

Использовать результаты PR 281.

Все agreed thresholds должны пройти или иметь документированный доказанный технический блокер.

#### Проверить observability

Использовать PR 282.

Проверить:

- metrics;
- diagnostics;
- отсутствие PII/high-cardinality;
- отсутствие secrets/raw CSV.

#### Проверить документацию

Обновить фактические:

- OpenAPI;
- RBAC matrix;
- admin guide;
- import guide;
- migration guide;
- rollback/forward-fix runbook;
- operational diagnostics;
- external integration readiness.

Не поддерживать отдельный дублирующий implementation tracker после завершения реализации.

### Какие решения

Release считается готовым только по фактическим результатам проверок.

Нельзя:

- ослаблять tests ради green CI;
- отключать security checks;
- скрывать `[НЕ ПРОВЕРЕНО]`;
- считать documentation-only assertion доказательством runtime behavior;
- выполнять production deployment/migration автоматически в рамках этого PR.

Production rollout — отдельное действие.

### Критерии готовности

- PR 266–283 реализованы;
- clean migration проходит;
- representative upgrade проходит;
- DB constraints соответствуют модели;
- двухtenant security matrix проходит;
- PR 266 exploit regression проходит;
- admin full-flow E2E проходит;
- manager scoped-flow E2E проходит;
- learner effective-training E2E проходит;
- Department/Position/ReportingLine/LMS/report/import/history flows интегрированы;
- lifecycle semantics подтверждены;
- accessibility/i18n/visual checks проходят;
- performance gate PR 281 закрыт;
- observability gate PR 282 закрыт;
- external mapping PR 283 проверен;
- OpenAPI/RBAC/docs соответствуют коду;
- все обязательные repository checks и CI зелёные;
- нет module-critical `[НЕ ПРОВЕРЕНО]`;
- production mutation не выполнялась без отдельного разрешения.

---

# Итоговая последовательность реализации

```text
PR 266  Security fix ManagerGroup
  ↓
PR 267  Group / Department separation
  ↓
PR 268  Department + DepartmentType + OrgStructureEvent
  ↓
PR 269  Department Tree API + safe reparent
  ↓
PR 270  Department Tree UI
  ↓
PR 271  DepartmentMembership + transfer history
  ↓
PR 272  DepartmentManager + inheritance
  ↓
PR 273  Users / Managers UI
  ↓
PR 274  Headcount
  ↓
PR 275  Position
  ↓
PR 276  Legacy User.position migration
  ↓
PR 277  Department LMS targeting + PositionCourse
  ↓
PR 278  Organization access scope + RBAC + Department reports
  ↓
PR 279  ReportingLine
  ↓
PR 280  Import + lifecycle + durable history
  ↓
PR 281  Performance verification + conditional optimization
  ↓
PR 282  Observability + diagnostics
  ↓
PR 283  External identifiers / HRIS-SCIM readiness
  ↓
PR 284  Final integration verification + release gate
```
