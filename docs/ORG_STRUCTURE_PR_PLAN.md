# Org Structure PR Plan (PR 266–281)

> **Статус:** `OWNER-DECISION` — объём (все 16 PR целиком vs урезанный набор) не подтверждён владельцем. См. `docs/TODO_VERIFY.md` TV-056. ИИ-агент не должен начинать PR 267+ без явного решения владельца по объёму; **PR 266 — исключение**, это security-фикс для уже существующей уязвимости и может выполняться независимо от решения по остальному объёму.
>
> **Почему отдельный документ, а не сразу в `DEVELOPMENT_PLAN.md`:** это ещё не owner-approved инициатива, а `DEVELOPMENT_PLAN.md` активно и параллельно редактируется несколькими агентами. Вливать 16 неподтверждённых PR в общий план means риск, что кто-то начнёт PR 267+ без вашего решения. После подтверждения объёма — добавить сокращённую секцию в `DEVELOPMENT_PLAN.md` (по образцу «Фаза J») со ссылкой сюда.
>
> **Важно про нумерацию:** на момент написания (2026-08-24) последний занятый номер в `DEVELOPMENT_PLAN.md` — PR 265, поэтому 266–281 свободны. `DEVELOPMENT_PLAN.md` меняется параллельно несколькими агентами почти каждый час — **перед стартом реализации любого PR из этого документа необходимо заново проверить актуальный `main`** и при необходимости перенумеровать (см. прецедент: в этой же сессии PR 239–244 пришлось перенумеровать в 260–265, потому что номера заняла не связанная серия, влившаяся параллельно).

## Зачем

PR 266–281 с учётом требований к гибкой оргструктуре:

- произвольная древовидная структура подразделений;
- создание, редактирование, перенос и архивирование подразделений;
- несколько руководителей одного подразделения;
- структурные и функциональные руководители;
- наследование руководителей от родительского подразделения;
- один основной и дополнительные руководители;
- история назначения руководителей;
- история переводов сотрудников;
- основное и дополнительное членство сотрудника в подразделениях;
- должности;
- массовое назначение обучения по подразделению и поддереву;
- отчёты и manager scope по поддереву;
- импорт оргструктуры;
- последующая оптимизация иерархических запросов только при доказанной необходимости.

## Ключевые архитектурные принципы

1. **`Department` не является `Group`.**
   - `Department` — штатная организационная структура.
   - `Group` — учебная группа, команда, cohort или произвольная подборка пользователей.

2. **У подразделения один структурный родитель.**
   - Оргструктура остаётся деревом.
   - Несколько родителей для одного `Department` не допускаются.
   - Матричные отношения реализуются через руководителей, membership, reporting lines и `Group`, а не через превращение дерева в граф.

3. **Руководители подразделения — отдельная сущность.**
   - Не использовать одиночное поле `Department.headUserId`.
   - Поддерживать несколько руководителей.
   - Поддерживать типы `DIRECT` и `FUNCTIONAL`.
   - Поддерживать наследование руководителей от вышестоящих подразделений.

4. **Привязка сотрудника к подразделению — отдельная сущность.**
   - Не ограничиваться `User.departmentId`.
   - Использовать `DepartmentMembership`.
   - Поддерживать основное и дополнительное членство.
   - Хранить историю переводов через `effectiveFrom` / `effectiveTo`.

5. **Должность — отдельная сущность `Position`.**
   - Legacy `User.position` удаляется только после безопасной миграции.

6. **Оргструктура сама по себе не выдаёт RBAC-права.**
   - Назначение пользователя руководителем не должно автоматически делать его `manager`.
   - Доступ определяется отдельным backend scope resolver с учётом RBAC.

7. **Иерархия начинается с adjacency list.**
   - `parentId` + PostgreSQL recursive CTE через `$queryRaw` — паттерн уже используется в проекте (`progress.service.ts`, `outbox.service.ts`, `assessments.service.ts`), новых зависимостей не требует.
   - Closure table / `ltree` добавляются только после измерений и доказанного bottleneck.

8. **Код подразделения не является техническим идентификатором дерева.**
   - `id` — UUID.
   - `parentId` — структура.
   - `sortOrder` — порядок.
   - `code` — стабильный бизнес-код.
   - Если нужны визуальные номера вида `1.2.3`, их следует вычислять или вести как отдельное представление, не связывая ими дерево.

---

# Целевая модель

```text
Organization
│
├── Department
│   ├── parent
│   ├── children
│   ├── code
│   ├── sortOrder
│   ├── isActive / archivedAt
│   │
│   ├── DepartmentManager
│   │   ├── DIRECT
│   │   ├── FUNCTIONAL
│   │   ├── isPrimary
│   │   ├── effectiveFrom
│   │   └── effectiveTo
│   │
│   └── DepartmentMembership
│       ├── user
│       ├── position
│       ├── isPrimary
│       ├── effectiveFrom
│       └── effectiveTo
│
├── Position
│   └── requiredCourses
│
├── User
│
├── ReportingLine              # отдельный optional слой персонального подчинения
│   ├── employee
│   ├── manager
│   ├── type
│   └── history
│
└── Group
    ├── learning group
    ├── temporary team
    └── cohort
```

## Разрешение руководителей

Для каждого типа руководителя подразделение должно иметь режим:

```text
INHERIT  — использовать руководителей ближайшего подходящего предка
LOCAL    — использовать только локально назначенных руководителей
MERGE    — объединять локальных и наследуемых руководителей
```

Наследуемые руководители **не копируются физически** в дочерние подразделения. Backend вычисляет эффективный набор руководителей при чтении scope / дерева.

Пример:

```text
Горный департамент
DIRECT: Иванов
FUNCTIONAL: Петров

└── Геотехнический отдел
    DIRECT mode: INHERIT
    FUNCTIONAL mode: MERGE
    FUNCTIONAL local: Сидоров

Эффективно:
DIRECT: Иванов
FUNCTIONAL: Петров + Сидоров
```

## Подсчёт сотрудников

Чтобы не считать сотрудника несколько раз при дополнительном membership:

- `directUserCount` — только активные **primary memberships** непосредственно в подразделении;
- `subtreeUserCount` — активные **primary memberships** подразделения и всех descendants;
- дополнительные memberships могут отображаться отдельно, но не должны по умолчанию увеличивать headcount.

## Открытый вопрос: дуализм Groups и Departments

После PR 280 в системе будет **два независимых механизма** для определения manager scope: `ManagerGroup` (существующий) и `DepartmentManager` (новый). Документ намеренно не ломает `ManagerGroup` (PR 266–278 сохраняют его как отдельный механизм), но не решает, будет ли этот дуализм постоянным или `ManagerGroup` со временем депрецируется в пользу `Department`. Это отдельный продуктовый вопрос, зафиксированный как `OWNER-DECISION` в `docs/TODO_VERIFY.md` (TV-056) — не решать его автономно при реализации PR 266–281.

---

# Последовательность Pull Request

## PR 266 — Закрыть расширение manager scope через Groups

### Цель

Устранить текущий риск авторизации, при котором `ManagerGroup` является источником manager scope и при недостаточной object-level проверке может использоваться для расширения области доступа.

> **Подтверждено по коду (2026-08-24):** это не гипотетический риск. `GroupsService.addManager()` (`apps/api/src/modules/groups/groups.service.ts:167-178`) проверяет только принадлежность группы и пользователя к organizationId (tenant-scope) — **без** проверки, что вызывающий actor уже управляет этой группой. Эндпоинт `POST /groups/:id/managers` защищён политикой `groupsCreate: ['admin', 'manager']` (`apps/api/src/modules/auth/roles.ts:21`), то есть любой `manager` организации может назначить себя менеджером произвольной чужой группы через прямой API-запрос. Это реальная privilege escalation в текущем `main`, не зависящая от остальных 15 PR этого документа.

### Что необходимо сделать

- Ограничить изменение managers у группы:
  - предпочтительно `admin`-only для назначения/снятия group managers;
  - либо разрешать manager только операции в уже подтверждённом scope.
- Запретить manager назначать себя manager произвольной чужой группы.
- Добавить object-level authorization на:
  - просмотр members группы;
  - добавление/удаление members;
  - просмотр managers;
  - добавление/удаление managers.
- Проверить согласованность `ManagerGroup` с RBAC-политикой.
- Не повышать роль пользователя автоматически при создании `ManagerGroup`.
- Добавить regression integration test:
  - manager не управляет чужой группой;
  - manager не назначает себя её manager;
  - после неудачной попытки не получает пользователей, assignments и reports этой группы.
- Не менять новую Department-модель в этом PR.

### Не входит

- Модель `Department` и любые связанные сущности — отдельная работа, начиная с PR 268.
- Изменение UI терминологии Groups/Department — предмет PR 267.

### Критерии готовности

- Manager не может расширить scope через Groups API.
- Чужая группа не модифицируется прямым API-запросом.
- Admin сохраняет необходимые административные операции.
- Existing manager-scope tests проходят.
- Есть отдельный regression test privilege escalation.
- Нет незапланированного breaking API change.
- CI проходит.

### Rollback

Изменение — сужение RBAC-проверок (additive middleware/guard логика, без изменения схемы БД). Откат — `git revert` коммита; данных, требующих отдельного восстановления, нет.

---

## PR 267 — Разделить Group и Department в терминологии и UI

### Цель

Убрать смешение учебных групп и штатной оргструктуры до появления отдельного `Department`.

### Что необходимо сделать

- Текущий UI, работающий с `Group`, называть:
  - `Groups`;
  - `Teams`;
  - `Learning groups`;
  - или термином, принятым в продукте.
- Убрать из `Group` UI ложную семантику:
  - Department;
  - department head;
  - organizational hierarchy.
- Разделить навигацию:
  - `Groups`;
  - `Organization structure / Departments`.
- Устранить ограничения выдачи в 200 записей:
  - server pagination;
  - server search;
  - server-side user selector.
- Проверить manager/admin видимость после PR 266.

### Не входит

- Создание реального раздела `Organization structure` — навигационный пункт может временно вести на заглушку/пустой экран до PR 270.
- Изменение backend-модели `Group`/`GroupMember`/`ManagerGroup`.

### Критерии готовности

- `Group` нигде в основном UI не выдаётся за штатное подразделение.
- Страница работает при >200 users/groups.
- Поиск и пагинация серверные.
- RBAC соответствует PR 266.
- Frontend tests обновлены.
- Документация терминологии обновлена.
- CI проходит.

### Rollback

Чисто frontend-изменение (тексты, навигация, серверная пагинация уже существующего API). `git revert`; данных не затрагивает.

---

## PR 268 — Добавить базовую модель Department

### Цель

Создать независимую модель штатных подразделений и фундамент дерева без изменения существующей семантики `Group`.

### Что необходимо сделать

Добавить `Department`:

```text
id
organizationId
parentId?
name
code?
sortOrder
isActive / archivedAt
directManagerMode
functionalManagerMode
createdAt
updatedAt
```

Рекомендуемые значения manager mode:

```text
INHERIT
LOCAL
MERGE
```

Добавить связи:

```text
Organization → Departments
Department.parent → Department
Department.children → Department[]
```

Добавить ограничения и индексы:

- `(organizationId, parentId)`;
- `(organizationId, isActive)` либо `(organizationId, archivedAt)`;
- unique business code внутри tenant, если code задан;
- parent принадлежит тому же tenant;
- parent не равен самому Department;
- удаление родителя с active children не должно каскадно уничтожать дерево.

Не выполнять автоматическое:

```text
Group → Department
```

### Не входит

- Tree API (move/archive/поиск) — PR 269.
- UI — PR 270.
- Membership и managers — PR 271–272.

### Критерии готовности

- В Prisma существует отдельный `Department`.
- `Group`, `GroupMember`, `ManagerGroup` не меняют семантику.
- Миграция additive.
- Existing data не удаляются.
- Rollback описан.
- Cross-tenant parent запрещён.
- Есть DB/integration tests constraints.
- CI проходит.

### Rollback

Миграция чисто additive (`CREATE TABLE departments`, без изменений существующих таблиц). Откат — `DROP TABLE departments` в down-миграции; существующие данные `Group`/`User`/остальных моделей не затронуты, т.к. `Department` не имеет обязательных FK от других таблиц на этом этапе.

---

## PR 269 — Реализовать Department Tree API и безопасный reparent

### Цель

Создать backend для произвольной древовидной оргструктуры.

### Что необходимо сделать

Создать NestJS module `departments`.

Добавить API:

```http
GET    /departments
GET    /departments/tree
GET    /departments/:id

POST   /departments
PATCH  /departments/:id

POST   /departments/:id/move
POST   /departments/:id/archive
```

Реализовать:

- root departments;
- child departments;
- recursive tree loading;
- reparent;
- sorting внутри одного parent;
- search по name/code;
- controlled archive.

Проверки:

- parent существует;
- parent того же tenant;
- `parentId != id`;
- нельзя переместить Department в собственного descendant;
- нельзя создать цикл;
- нельзя архивировать/удалить узел без обработки active children;
- reparent выполняется транзакционно.

На первом этапе:

```text
adjacency list + PostgreSQL recursive CTE
```

### Не входит

- UI — PR 270.
- Membership/managers endpoints — PR 271–272.

### Критерии готовности

- Поддерживается произвольная допустимая глубина.
- Root/child create работают.
- Move между ветками работает.
- Cycle attempt возвращает контролируемую ошибку.
- Cross-tenant move запрещён.
- Сортировка siblings работает.
- Архивация не повреждает дерево.
- Есть unit + PostgreSQL integration tests.
- API документирован.
- CI проходит.

### Rollback

Новый модуль/контроллер/сервис без изменения существующих модулей. `git revert`; данные не мигрировались отдельно от PR 268, откат не требует восстановления данных.

---

## PR 270 — Реализовать базовый UI дерева подразделений

### Цель

Создать экран оргструктуры в формате tree table, аналогичном референсному UI.

### Что необходимо сделать

Создать страницу:

```text
Управление пользователями
→ Подразделения
```

Базовая таблица:

```text
Подразделение | Код | Руководители | Пользователи | Действия
```

Реализовать:

- expand/collapse;
- expand all;
- collapse all;
- выбор строки;
- создание root department;
- создание child department;
- редактирование;
- move;
- archive;
- поиск;
- sort order;
- contextual menu.

Пример:

```text
⋯
├─ Создать дочернее подразделение
├─ Просмотреть пользователей
├─ Редактировать
├─ Переместить
└─ Архивировать
```

На этом этапе колонка руководителей может быть пустой/placeholder до PR 272–273.

### Не входит

- Реальное управление менеджерами (только placeholder) — PR 272–273.
- Headcount колонки — PR 274.

### Критерии готовности

- UI строится на `Department`, а не `Group`.
- Минимум 3 уровня вложенности корректно отображаются.
- Expand/collapse не перезагружает страницу.
- Create/edit/move синхронизируются с API.
- Ошибки backend отображаются пользователю.
- Доступ к экрану контролируется RBAC.
- Есть frontend tests.
- CI проходит.

### Rollback

Чисто frontend-изменение (новая страница/маршрут). `git revert`; backend и данные не затрагиваются.

---

## PR 271 — Добавить DepartmentMembership и историю размещения сотрудников

### Цель

Связать пользователей с оргструктурой без ограничения `User.departmentId` и сохранить историю переводов.

### Что необходимо сделать

Добавить:

```text
DepartmentMembership
├── id
├── organizationId
├── departmentId
├── userId
├── positionId?          # nullable до PR 275
├── isPrimary
├── effectiveFrom
├── effectiveTo?
├── createdAt
└── updatedAt
```

Правила:

- у пользователя может быть несколько memberships;
- одновременно активный primary membership — максимум один в tenant;
- дополнительные memberships разрешены;
- история не перезаписывается при переводе;
- перевод закрывает предыдущий период и создаёт новый membership;
- archived/deleted user не получает новый active membership;
- Department и User одного tenant.

Добавить API:

```http
GET  /departments/:id/users
GET  /users/:id/department-memberships

POST /department-memberships
POST /department-memberships/:id/close
POST /users/:id/department-transfer
```

Для bulk transfer — отдельная транзакционная операция.

### Не входит

- `positionId` заполнение — Position появляется в PR 275, до этого поле nullable и не используется.
- UI переводов — PR 273.

### Критерии готовности

- У пользователя есть primary Department без использования `User.departmentId`.
- Дополнительные memberships поддерживаются.
- Одновременно нельзя создать два active primary membership.
- История переводов сохраняется.
- Cross-tenant membership запрещён.
- Bulk transfer атомарен либо имеет явно документированную batch semantics.
- Есть integration tests по истории и граничным датам.
- CI проходит.

### Rollback

Additive-миграция (`CREATE TABLE department_memberships`). Откат — `DROP TABLE`; `User`/`Department` не изменяются структурно, данные восстанавливать не требуется.

---

## PR 272 — Добавить несколько руководителей подразделения и наследование

### Цель

Поддержать несколько структурных и функциональных руководителей для одного Department, включая наследование от вышестоящих подразделений.

### Что необходимо сделать

Добавить enum:

```text
DepartmentManagerType
├── DIRECT
└── FUNCTIONAL
```

Добавить:

```text
DepartmentManager
├── id
├── organizationId
├── departmentId
├── userId
├── type
├── isPrimary
├── effectiveFrom
├── effectiveTo?
├── createdAt
└── updatedAt
```

Ограничения:

- один и тот же user не дублируется как один и тот же active manager type одного Department;
- допускается несколько `DIRECT`;
- допускается несколько `FUNCTIONAL`;
- максимум один active `isPrimary=true` на Department + manager type;
- manager assignment и Department одного tenant;
- archived/deleted user не назначается новым manager;
- история manager assignments сохраняется.

> **Паттерн защиты от гонки:** для инвариантов "не более одного active `isPrimary=true` на (departmentId, type)" и "уникальный active (departmentId, userId, type)" использовать partial unique index на PostgreSQL (`WHERE effective_to IS NULL` или аналогичное условие active-строки), а не проверку на уровне приложения. В проекте уже есть прецедент именно такой гонки и её фикса — course-level progress race condition (PR 223 из `DEVELOPMENT_PLAN.md`, миграция `fix_course_progress_race`). Использовать тот же подход, а не изобретать защиту заново.

Использовать manager mode из `Department`:

```text
INHERIT
LOCAL
MERGE
```

Реализовать resolution:

```text
effectiveDirectManagers(department)
effectiveFunctionalManagers(department)
```

Правила:

- `INHERIT` — брать ближайший эффективный набор от ancestor;
- `LOCAL` — только локальные assignments;
- `MERGE` — локальные + inherited;
- inherited rows не копируются в БД;
- duplicate users при MERGE схлопываются детерминированно;
- локальный primary имеет приоритет над inherited primary;
- отсутствие локального primary должно иметь определённое правило выбора inherited primary.

Добавить API:

```http
GET    /departments/:id/managers
GET    /departments/:id/effective-managers

POST   /departments/:id/managers
PATCH  /departments/:id/managers/:managerAssignmentId
DELETE /departments/:id/managers/:managerAssignmentId

PATCH  /departments/:id/manager-modes
```

### Не входит

- UI назначения менеджеров — PR 273.
- Связь с RBAC/manager scope — PR 278.

### Критерии готовности

- Department имеет 0..N DIRECT managers.
- Department имеет 0..N FUNCTIONAL managers.
- Можно назначить primary manager каждого типа.
- История manager assignments сохраняется.
- INHERIT работает минимум через 3 уровня дерева.
- LOCAL отключает наследование.
- MERGE объединяет локальных и inherited managers без дублей.
- Изменение manager у ancestor сразу отражается у inheriting descendants без копирования строк.
- Назначение manager не изменяет RBAC-role пользователя.
- Партиальные unique-индексы покрывают инварианты active-primary и active-duplicate (см. паттерн выше).
- Есть integration tests DIRECT/FUNCTIONAL/INHERIT/LOCAL/MERGE.
- CI проходит.

### Rollback

Additive-миграция (`CREATE TABLE department_managers` + partial unique indexes). Откат — `DROP TABLE`; `Department` не меняется структурно.

---

## PR 273 — Добавить UI сотрудников и нескольких руководителей подразделения

### Цель

Реализовать административный UX уровня референсного продукта для пользователей и руководителей Department.

### Что необходимо сделать

В Department edit/create dialog добавить:

```text
Название подразделения
Родительское подразделение
Код
Порядок

Структурные руководители
[ Иванов × ] [ Петров × ] [+ Добавить]
Режим: INHERIT / LOCAL / MERGE
Основной руководитель: Иванов

Функциональные руководители
[ Сидоров × ] [ Ким × ] [+ Добавить]
Режим: INHERIT / LOCAL / MERGE
Основной функциональный: Сидоров
```

Для inherited managers показывать:

- что manager наследован;
- от какого Department;
- тип manager;
- primary status.

Добавить экран:

```text
Пользователи подразделения
```

Функции:

- поиск;
- pagination;
- primary/additional membership indicator;
- перевод пользователя;
- bulk transfer;
- просмотр пути Department;
- история membership при наличии соответствующего permission.

В tree table:

- показывать primary direct manager;
- при нескольких managers отображать `Имя + N`;
- tooltip/popover со всеми direct/functional managers;
- явно различать local и inherited.

### Не входит

- Headcount-колонки — PR 274.
- Должности в UI — PR 275.

### Критерии готовности

- Можно назначить несколько DIRECT/FUNCTIONAL managers через UI.
- Можно выбрать primary manager.
- Можно переключить INHERIT/LOCAL/MERGE.
- Inherited manager визуально отличим от local.
- Пользователей Department можно просматривать и искать.
- Перевод пользователя работает через `DepartmentMembership`.
- Дополнительные memberships не теряются.
- UI не выдаёт manager assignment за RBAC-role.
- Есть frontend tests.
- CI проходит.

### Rollback

Чисто frontend-изменение поверх API из PR 269/271/272. `git revert`; backend/данные не затрагиваются.

---

## PR 274 — Добавить direct/subtree headcount без двойного счёта

### Цель

Сделать дерево пригодным для администрирования, массовых назначений и отчётности.

### Что необходимо сделать

В tree API возвращать:

```text
directUserCount
subtreeUserCount
additionalMembershipCount?   # optional
```

Правила:

- headcount считается по active primary memberships;
- один user учитывается один раз;
- additional memberships не увеличивают основной headcount;
- archived users не учитываются;
- historical memberships не учитываются в current count.

Пример:

```json
{
  "name": "Production",
  "directUserCount": 4,
  "subtreeUserCount": 94
}
```

UI:

```text
94 сотрудников
4 непосредственно
90 в дочерних подразделениях
```

Исключить N+1 запрос на каждый Department.

### Не входит

- Оптимизация подсчёта через closure table/ltree — предмет PR 281, только при доказанном bottleneck.

### Критерии готовности

- direct count корректен.
- subtree count корректен минимум для 3 уровней.
- additional membership не создаёт двойной headcount.
- Counts меняются после transfer.
- Counts меняются после reparent.
- Нет N+1 на каждый узел.
- Есть integration/performance-oriented tests.
- CI проходит.

### Rollback

Изменение только read-запросов tree API (добавление вычисляемых полей в ответ), схема не меняется. `git revert`.

---

## PR 275 — Добавить справочник Position

### Цель

Заменить свободный `User.position` нормализованным справочником должностей.

### Что необходимо сделать

Добавить:

```text
Position
├── id
├── organizationId
├── code
├── title
├── isActive
├── createdAt
└── updatedAt
```

Связать Position с `DepartmentMembership.positionId`, а не жёстко только с `User`, чтобы должность могла корректно отражаться в истории переводов.

Legacy:

```text
User.position
```

пока не удалять.

Добавить API:

```http
GET    /positions
GET    /positions/:id
POST   /positions
PATCH  /positions/:id
POST   /positions/:id/archive
```

UI:

```text
Управление пользователями
├── Подразделения
├── Должности
└── Группы
```

### Не входит

- Миграция существующих значений `User.position` в `Position` — отдельный PR 276.
- Удаление legacy-поля — только после подтверждённого отсутствия клиентов, не в этом PR и не в PR 276.

### Критерии готовности

- Position tenant-scoped.
- Должность назначается membership пользователя.
- Исторический membership сохраняет историческую должность.
- Searchable position selector работает.
- Legacy `User.position` пока совместим.
- Есть integration/frontend tests.
- CI проходит.

### Rollback

Additive-миграция (`CREATE TABLE positions`, nullable `positionId` на `DepartmentMembership`). Откат — `DROP TABLE`/`DROP COLUMN`; `User.position` не тронут.

---

## PR 276 — Безопасно мигрировать legacy User.position

### Цель

Перенести существующие строковые должности в `Position` / `DepartmentMembership.positionId` без потери исходных данных.

### Что необходимо сделать

Реализовать dry-run/backfill process (по образцу уже существующего в проекте `admin-demo-seed --dry-run`/`--apply`):

```text
legacy User.position
→ inventory
→ normalization report
→ Position candidates
→ explicit mapping
→ backfill Position
→ backfill active primary DepartmentMembership.positionId
→ validation
```

Не объединять автоматически спорные значения:

```text
"Менеджер"
" менеджер "
"МЕНЕДЖЕР"
```

без определённой политики нормализации.

Старое поле удалять отдельным последующим изменением только после подтверждения отсутствия клиентов.

### Не входит

- Удаление `User.position` — отдельная задача после подтверждения, что все клиенты API мигрировали.

### Критерии готовности

- Legacy значения не потеряны.
- Есть dry-run report.
- Неоднозначные значения перечислены отдельно.
- Backfill можно проверить до destructive cleanup.
- Rollback описан.
- Старый API не ломается в переходный период.
- CI проходит.

### Rollback

Backfill-скрипт с `--dry-run` по умолчанию; `--apply` только создаёт `Position` записи и заполняет `positionId` — не удаляет и не изменяет `User.position`. Откат — очистить созданные `Position`/`positionId` записи скриптом или транзакцией; исходные данные (`User.position`) не изменялись и восстановления не требуют.

---

## PR 277 — Добавить назначения курсов по Department и поддереву

### Цель

Использовать штатную оргструктуру как отдельный target обучения.

### Что необходимо сделать

Расширить assignment target:

```text
USER
GROUP
DEPARTMENT
```

Для `DEPARTMENT` поддержать:

```text
targetDepartmentId
includeDescendants
```

Рекомендуемая current-membership semantics:

- назначение применяется к active **primary memberships**;
- additional membership не выдаёт курс автоматически;
- это правило документируется и тестируется.

UI:

```text
Target: Department
Department: Production
[x] Включить дочерние подразделения
```

Не материализовать тысячи отдельных assignment rows без необходимости архитектуры.

Явно определить поведение при:

- transfer пользователя;
- reparent Department;
- archive Department;
- archive user;
- изменении subtree.

### Не входит

- Recurring/scheduled Department assignments — не запрошено, не проектировать заранее.

### Критерии готовности

- Department assignment работает.
- includeDescendants работает.
- User вне subtree не получает assignment.
- Additional membership не создаёт неявное назначение по умолчанию.
- Existing User/Group assignments не ломаются.
- Transfer/reparent semantics документированы.
- Есть PostgreSQL integration tests.
- UI поддерживает Department target.
- CI проходит.

### Rollback

Additive: новое значение enum target type + новые nullable поля на существующей assignment-модели. Откат — `git revert`; существующие USER/GROUP assignments не затрагиваются структурно.

---

## PR 278 — Добавить OrganizationScope, отчёты и manager access по поддереву

### Цель

Безопасно связать оргструктуру с доступом руководителей, не смешивая manager assignment и RBAC.

### Что необходимо сделать

Добавить domain service:

```text
OrganizationScope
```

который разрешает:

```text
actor
→ RBAC permissions
→ effective DepartmentManager assignments
→ accessible Departments
→ accessible Users
```

Правила:

- `DepartmentManager` не выдаёт роль.
- Пользователь без соответствующей RBAC permission может отображаться как руководитель, но не получает manager API.
- Типы DIRECT/FUNCTIONAL могут иметь разные permissions.
- inherited managers учитываются через effective manager resolution.
- соседние ветки не должны попадать в scope.
- existing `ManagerGroup` scope сохраняется как отдельный механизм.

> **Зависимость от PR 226:** этот PR расширяет RBAC-поверхность (разные permissions для DIRECT/FUNCTIONAL). В плане уже есть отдельный PR 226 («Synchronize architecture and RBAC documentation with code», `docs/DEVELOPMENT_PLAN.md`), задача которого — синхронизировать `docs/API_RBAC_MATRIX.md` с фактическим кодом. PR 278 обязан обновить эту матрицу как часть своих критериев готовности, а не оставлять её устаревшей.

Добавить filters:

```text
Department
Include descendants
```

для:

- progress;
- completion;
- certificates;
- assignments;
- overdue training.

### Не входит

- Депрецация `ManagerGroup` — открытый вопрос, см. раздел «Открытый вопрос: дуализм Groups и Departments» выше.

### Критерии готовности

- Manager assignment сам по себе не повышает RBAC.
- Backend, а не frontend, ограничивает scope.
- DIRECT/FUNCTIONAL policy явно определена.
- Inherited manager scope работает согласно policy.
- Отчёт по Department работает.
- includeDescendants работает.
- Пользователи соседних веток исключены.
- Existing `ManagerGroup` access не ломается.
- `docs/API_RBAC_MATRIX.md` обновлён и соответствует новым endpoint'ам/permissions.
- Есть security regression tests.
- CI проходит.

### Rollback

Новый domain service + read-only scope filters. `git revert`; данные и существующий `ManagerGroup`-доступ не затрагиваются.

---

## PR 279 — Добавить персональные ReportingLine для матричного подчинения

### Цель

Поддержать персональную и матричную иерархию подчинённости, не превращая Department tree в граф.

### Что необходимо сделать

Добавить отдельную сущность:

```text
ReportingLine
├── id
├── organizationId
├── employeeUserId
├── managerUserId
├── type
├── isPrimary
├── effectiveFrom
├── effectiveTo?
├── createdAt
└── updatedAt
```

Типы могут быть:

```text
DIRECT
FUNCTIONAL
PROJECT
```

Назначение этой сущности:

- персональный direct manager;
- функциональный manager конкретного сотрудника;
- историческая смена руководителя;
- матричное подчинение.

Не использовать `ReportingLine` для Department parent-child hierarchy.

Добавить API:

```http
GET  /users/:id/reporting-lines
POST /users/:id/reporting-lines
PATCH /reporting-lines/:id
POST /reporting-lines/:id/close
```

Добавить anti-cycle validation для DIRECT chain.

### Не входит

- Влияние ReportingLine на OrganizationScope/manager access (PR 278) — если потребуется, отдельное расширение с явным обоснованием use case.

### Критерии готовности

- Персональный manager не требует изменения Department tree.
- Можно хранить несколько типов reporting line.
- История сохраняется.
- DIRECT reporting cycle запрещён.
- Cross-tenant reporting line запрещён.
- Department managers и personal managers остаются разными доменными понятиями.
- Есть integration tests.
- CI проходит.

### Rollback

Additive-миграция (`CREATE TABLE reporting_lines`). Откат — `DROP TABLE`; `Department`/`User` не меняются структурно.

---

## PR 280 — Добавить импорт организационной структуры

### Цель

Позволить массово загружать дерево Department, managers и memberships безопасным контролируемым процессом.

### Что необходимо сделать

Первый формат — CSV. XLSX добавить отдельным изменением при необходимости.

Минимальный departments CSV:

```csv
code,name,parentCode,directManagerEmails,functionalManagerEmails,directMode,functionalMode
001,Head Office,,,,"LOCAL","LOCAL"
001-01,Commercial,001,manager1@example.com;manager2@example.com,functional@example.com,"LOCAL","MERGE"
001-01-01,Sales,001-01,,,"INHERIT","INHERIT"
```

При необходимости memberships импортировать отдельным файлом:

```csv
userEmail,departmentCode,isPrimary,positionCode,effectiveFrom
user@example.com,001-01-01,true,GEOLOGIST,2026-01-01
```

Процесс:

```text
Upload
↓
Parse
↓
Validation
↓
Preview
↓
Confirm
↓
Transactional/batched apply
↓
Post-import validation
```

Валидации:

- duplicate code;
- duplicate department;
- unknown parent;
- cycle;
- unknown manager;
- duplicate manager assignment;
- invalid manager mode;
- multiple primary managers одного type;
- unknown user;
- multiple active primary memberships;
- cross-tenant relations;
- invalid date periods;
- conflict with existing data.

### Не входит

- XLSX-формат — отдельное изменение при подтверждённой необходимости.
- Автоматический re-import по расписанию/интеграция с внешними HR-системами — не запрошено.

### Критерии готовности

- Preview доступен до записи.
- Ошибки привязаны к строкам и причинам.
- Невалидный файл не оставляет полусозданное дерево.
- Импорт поддерживает несколько уровней.
- Несколько DIRECT/FUNCTIONAL managers импортируются.
- INHERIT/LOCAL/MERGE импортируются.
- Membership history не повреждается.
- Повторный импорт имеет явную update/skip/conflict policy.
- Формат документирован.
- Есть integration tests.
- CI проходит.

### Rollback

Импорт выполняется транзакционно/батчами с preview до записи; при сбое — откат транзакции штатными средствами Prisma. Код импорта — `git revert`, без последствий для уже импортированных данных (они относятся к конкретным прогонам, не к коду).

---

## PR 281 — Оптимизировать иерархические запросы только при доказанной необходимости

### Цель

Оптимизировать Department tree и subtree operations только после измерений реальной нагрузки.

### Что необходимо сделать

Сначала собрать baseline:

- число Departments на tenant;
- максимальная глубина;
- users per subtree;
- `/departments/tree` latency;
- subtree assignment latency;
- subtree reports latency;
- effective manager resolution latency;
- query plans;
- число recursive queries.

Только при подтверждённом bottleneck сравнить:

### Вариант A — Closure Table

```text
DepartmentClosure
├── ancestorId
├── descendantId
└── depth
```

### Вариант B — PostgreSQL ltree

Использовать `ltree`, только если PostgreSQL-specific преимущества оправдывают усложнение Prisma/raw SQL слоя.

Для текущего стека первым кандидатом является closure table.

### Не входит

- Реализация до появления подтверждённого baseline и bottleneck — сам смысл PR в том, чтобы не делать это заранее.

### Критерии готовности

- Есть baseline до оптимизации.
- Bottleneck подтверждён.
- Есть representative benchmark dataset.
- Новая модель измеримо быстрее.
- Reparent корректно обновляет closure/path.
- Manager inheritance и subtree counts остаются корректными.
- Циклы невозможны.
- Миграция проверена.
- Rollback описан.
- Публичный API не меняется без необходимости.
- CI и performance tests проходят.

### Rollback

Зависит от выбранного варианта (A/B) — описывается на этапе реализации, когда bottleneck и решение подтверждены. До этого момента PR не выполняется.

---

# Итоговая последовательность

```text
PR 266  Security: ManagerGroup / manager scope        ← можно делать независимо, прямо сейчас
   ↓
PR 267  Group ≠ Department + pagination/search
   ↓
PR 268  Department core schema
   ↓
PR 269  Department tree API + safe reparent
   ↓
PR 270  Department tree UI
   ↓
PR 271  DepartmentMembership + employee history
   ↓
PR 272  Multiple DepartmentManagers + inheritance
   ↓
PR 273  Users/managers UI
   ↓
PR 274  Direct/subtree headcount
   ↓
PR 275  Position catalog
   ↓
PR 276  Legacy position migration
   ↓
PR 277  Course assignments by Department/subtree
   ↓
PR 278  OrganizationScope + reports + manager access
   ↓
PR 279  Personal ReportingLine / matrix management
   ↓
PR 280  Organization structure import
   ↓
PR 281  Closure table / ltree only after measurements
```

# Архитектурные границы

```text
Department ≠ Group

Department parent-child hierarchy ≠ matrix reporting graph

DepartmentManager ≠ ManagerGroup

DepartmentManager ≠ RBAC role

DepartmentMembership ≠ User.departmentId

Position ≠ legacy User.position string

Department assignment ≠ Group assignment

DepartmentManager ≠ ReportingLine
```

# Что в итоге сможет настраивать администратор

После PR 266–280 администратор сможет без изменения кода:

- создавать любое количество корневых подразделений;
- создавать произвольную древовидную вложенность;
- менять parent подразделения;
- менять порядок узлов;
- архивировать подразделения;
- назначать несколько структурных руководителей;
- назначать несколько функциональных руководителей;
- выбирать основного руководителя каждого типа;
- наследовать руководителей от parent;
- смешивать inherited и local managers через `MERGE`;
- просматривать источник inherited manager;
- назначать сотрудника в primary Department;
- добавлять дополнительные memberships;
- переводить сотрудника с сохранением истории;
- хранить должность в контексте membership;
- видеть direct/subtree headcount;
- назначать курсы одному Department;
- назначать курсы всему поддереву;
- строить отчёты по Department и descendants;
- использовать Department managers для scope только совместно с RBAC policy;
- хранить персональные direct/functional reporting lines отдельно от Department;
- импортировать дерево, managers и memberships.

# Что намеренно не разрешается

Для сохранения предсказуемости и безопасности системы:

- один `Department` не может иметь несколько structural parents;
- Department tree не превращается в произвольный graph;
- manager assignment не повышает RBAC-role;
- inherited manager не копируется физически в descendants;
- additional membership не увеличивает headcount автоматически;
- `Group` не используется как замена `Department`;
- `code` не используется как технический способ хранения дерева;
- `ltree` / closure table не внедряются без доказанной необходимости.

# Рекомендуемый порядок реализации

1. **PR 266** — сначала закрыть текущий security risk. Не зависит от решения по остальному объёму.
2. **PR 267** — исправить семантику существующего Groups UI.
3. **PR 268–270** — создать независимое безопасное дерево Department и базовый UI.
4. **PR 271–274** — добавить memberships, историю, несколько руководителей, inheritance и корректный headcount.
5. **PR 275–276** — нормализовать должности и безопасно мигрировать legacy data.
6. **PR 277–278** — подключить оргструктуру к обучению, отчётам и manager scope.
7. **PR 279** — добавить персональную матричную hierarchy без усложнения Department tree.
8. **PR 280** — добавить промышленный импорт оргструктуры.
9. **PR 281** — оптимизировать дерево только после измерений.

Перед шагом 2 (PR 267) — дождаться решения владельца по объёму (TV-056). Шаги 5–9 (PR 275–281) — кандидаты на возможное сокращение объёма, если владелец не подтвердит потребность в Position-каталоге, персональном matrix-reporting или промышленном импорте.
