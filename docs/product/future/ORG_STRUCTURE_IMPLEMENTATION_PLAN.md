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
