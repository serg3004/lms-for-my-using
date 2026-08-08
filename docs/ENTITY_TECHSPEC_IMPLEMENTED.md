# Техспека реализованных сущностей LMS: модель данных, RBAC, edge cases

Дата: 2026-08-07
Проект: `lms-for-my-using`

Парный документ к `lms-entity-techspec.md` (99 нереализованных сущностей), но для **21 сущности, уже существующей в коде**. В отличие от того документа, здесь модель данных и RBAC — не концептуальные, а взяты напрямую из реального кода:
- **Модель данных** — из `apps/api/prisma/schema.prisma` (реальные поля, типы, связи, `onDelete`-поведение, индексы/уникальные ограничения).
- **RBAC** — из `docs/API_RBAC_MATRIX.md` и `apps/api/src/modules/auth/roles.ts` (актуальная матрица ролей `admin/manager/instructor/learner` + `CourseAccessGuard` для объектного уровня доступа).
- **Edge cases** — часть подтверждена как известные открытые вопросы в `docs/CONCERNS.md` (помечено явно), часть — граничные случаи, вытекающие из структуры схемы (soft-delete через `deletedAt`, `onDelete: Restrict/Cascade/SetNull`, уникальные ограничения).

---

## 1. Organization
**Модель данных:** `id, name, slug (unique), status (active/suspended/archived), plan (trial/standard/enterprise), themeSettings (Json?), createdAt/updatedAt, deletedAt (soft-delete)`. Корень мультиарендности — все 20 остальных моделей ссылаются на неё через `organizationId`.

**RBAC:** admin — read/create (по матрице `Organizations — read/create: ✓ admin`); остальные роли не имеют прямого доступа к CRUD организации. Изоляция между организациями обеспечивается на уровне каждого запроса через `organizationId` в scope, а не отдельным RBAC-правилом.

**Edge cases:**
- ~~`slug` уникален глобально — коллизия при регистрации новой организации требует явной обработки, а не generic 500~~ — **закрыто, при перепроверке не подтвердилось (2026-08-08).** `OrganizationsService.ensureOrganizationSlugIsAvailable` уже бросает явный `ConflictException('Organization slug already exists')`. Проверил и race condition (два одновременных запроса с одним slug, оба проходят SELECT-проверку до создания): `slug` помечен `@unique` в схеме, второй `create()` падает с Prisma `P2002`, а `ApiExceptionFilter.normalizePrismaError` уже конвертирует `P2002` в чистый `409 CONFLICT`. Дыры нет ни в обычном сценарии, ни в race condition — заметка была написана без проверки кода.
- ~~Soft-delete (`deletedAt`) организации не каскадирует автоматически на связанные записи~~ — **закрыто, при перепроверке не подтвердилось (2026-08-08).** Проверил `organizations.controller.ts` — endpoint'а для удаления организации не существует вообще (`@Delete(':id')` нет, только `@Delete(':id/theme')` для логотипа). Поле `deletedAt` есть в схеме и читающие запросы его фильтруют, но выставить его через API сейчас невозможно — проблема каскада сейчас нереализуема физически, потому что нет самой фичи удаления организации. Если/когда такой endpoint появится — каскад нужно спроектировать тогда, не раньше.
- **На будущее, не сейчас:** `plan` — enum без реального биллинга за ним (см. отраслевую карту, Subscription/Invoice/Payment, п. 11.1 нереализованных) — апгрейд/даунгрейд плана сейчас чисто административное действие без финансовых последствий. Осознанно отложено — нужно продуктовое решение, нужен ли биллинг вообще на этом этапе.

---

## 2. User
**Модель данных:** `id, organizationId (FK, onDelete: Restrict), email, passwordHash, firstName, lastName, middleName?, position?, shift?, phone?, status (active/invited/suspended/archived), locale (default "ru"), timezone (default "Asia/Almaty"), lastLoginAt?, createdAt/updatedAt, deletedAt`. Уникальность `[organizationId, email]` — один email уникален только в рамках организации, не глобально.

**RBAC:** admin/manager — read/create (`Users — read/create: ✓ admin ✓ manager`); instructor/learner — нет прямого доступа к CRUD чужих пользователей (только к себе через `/auth/me`).

**Edge cases:** проверены (2026-08-08) — все три оказались не проблемой, код не менялся.
- `onDelete: Restrict` на связи с `Organization` — **не баг, дизайн-решение** (описано в самом пункте: защищает от случайного каскадного удаления; удаление организации требует явного порядка операций — это ожидаемое поведение).
- Один и тот же email в разных организациях = разные пользователи (уникальность per-organization) — **не баг, дизайн-решение**, ожидаемое следствие модели мультиарендности.
- ~~`status: invited` — не описан явный TTL приглашения, «зависшие» приглашения не самоочищаются~~ — **закрыто, при перепроверке не подтвердилось.** Флоу приглашений в коде не существует вообще: `invited` — значение enum'а (`userStatusSchema`), которое нигде не выставляется автоматически (нет endpoint'а приглашения/активации, нет отправки email). `createUserSchema` по умолчанию создаёт пользователя сразу `active`. Нечему присваивать TTL — самого механизма приглашений, порождающего зависшие записи, не существует. **На будущее:** если понадобится реальный флоу приглашений (email + активация + TTL) — это отдельная фича, не фикс, обсуждать отдельно.

---

## 3. Membership
**Модель данных:** `id, organizationId (FK Cascade), userId (FK Cascade), role (UserRole: learner/instructor/manager/admin), assignedBy? (FK User, SetNull), createdAt`. Уникальность `[organizationId, userId, role]` — один пользователь может иметь несколько ролей одновременно в одной организации (разные строки `Membership`).

**RBAC:** admin — read/create (`Memberships — create: ✓ admin` только); manager — только read (`Memberships — read: ✓ admin ✓ manager`), не может сам назначать роли.

**Edge cases:**
- Пользователь может одновременно иметь роли `instructor` и `manager` (мультиролевость через отдельные строки) — RBAC-проверки и `CourseAccessGuard` должны корректно объединять права всех активных ролей пользователя, а не брать только одну.
- `assignedBy` — `SetNull` при удалении назначившего пользователя — история теряет автора назначения роли, что ослабляет аудиторский след (перекликается с открытым вопросом Audit Log в `docs/CONCERNS.md`).
- ~~Удаление последней `admin`-роли в организации — схема не запрещает организацию остаться совсем без администратора~~ — **закрыто (2026-08-08):** `UsersService.updateUser` теперь проверяет, что демотируемый пользователь не последний `admin` в организации (иначе `ConflictException`), до старта транзакции смены роли. Дырка была только в `updateUser` (единственное место, где роль реально снимается — у `MembershipsController` нет delete-эндпоинта вовсе).

---

## 4. Session
**Модель данных:** `id, jti (unique), userId (FK Cascade), organizationId (FK Cascade), refreshTokenHash? (unique), createdAt, expiresAt, refreshExpiresAt?, revokedAt?`.

**RBAC:** доступна только самому пользователю через `authenticated`-эндпоинты (`logout`, `logout-all`, `auth/me`) — прямого CRUD через роли `admin/manager/instructor/learner` нет; `logout-all` отзывает через `prisma.session.updateMany` (задокументировано как закрытый concern в `docs/CONCERNS.md` — зависит только от Postgres, не от Redis).

**Edge cases:** проверены (2026-08-08).
- Rate limiting входа завязан на отдельный in-memory/Redis механизм — сейчас в проде in-memory режим (тот же открытый concern из `docs/CONCERNS.md`, что и раньше). **Не трогали** — это инфра-задача (нужен Redis на Railway), не код.
- ~~`revokedAt` устанавливается, но истёкшая сессия физически не удаляется — нужен periodic cleanup~~ — **закрыто частично (2026-08-08):** добавлен `AuthSessionStore.cleanupExpired(dryRun, now)` + скрипт `apps/api/src/scripts/session-cleanup.ts` (`pnpm --filter @lms/api session:cleanup [-- --execute]`), удаляющий сессии, у которых истёк `refreshExpiresAt` (или `expiresAt`, если `refreshExpiresAt` не задан) либо стоит `revokedAt`. Автозапуска по расписанию нет — только ручной запуск, аналогично `storage:cleanup`/`storage:multipart-cleanup`.
- ~~Login возвращает access token одновременно и в cookie, и в JSON body — избыточность~~ — **закрыто, при перепроверке не подтвердилось (2026-08-08).** Это не избыточность — `accessToken` в теле реально используется для Bearer-авторизации не-браузерными клиентами (подтверждено в `apps/api/src/integration/api.database-smoke.spec.ts`, где токен из тела передаётся как `Authorization: Bearer`). Убрать нельзя, не сломав этот путь авторизации. Код не менялся.

---

## 5. Group
**Модель данных:** `id, organizationId (FK Cascade), name, slug, description?, location?, status (active/archived), createdAt/updatedAt, deletedAt`. Уникальность `[organizationId, slug]`.

**RBAC:** admin/manager — read/create (`Groups — read/create: ✓ admin ✓ manager`); instructor/learner — нет прямого доступа к CRUD группы (только опосредованно через членство).

**Edge cases:** проверены (2026-08-08).
- ~~Архивация группы не описывает явно, что происходит с активными `Assignment`~~ — **закрыто (2026-08-08), но находка оказалась шире исходной формулировки.** При проверке выяснилось, что `status` вообще нигде не enforced — не фильтровался ни в `listGroups`, ни при создании `Assignment` на группу, ни в проверке самозаписи `Progress` (см. п. 14). По продуктовому решению реализовано:
  - `AssignmentsService.createAssignment` теперь отклоняет назначение курса на архивную группу (`ConflictException`), если `groupId` указывает на группу со `status: archived`.
  - `GroupsService.listGroups` принимает query-параметр `status` (`active` по умолчанию / `archived` / `deleted`) — по умолчанию архивные и удалённые группы скрыты из выдачи, `archived` показывает только архивные, `deleted` — только soft-deleted (`deletedAt != null`).
  - **Важно для фронтенда:** `AdminOrgStructurePage.tsx` и `AdminAssignmentCompletionPage.tsx` вызывают `GET /groups` без параметров — после этой правки они автоматически перестанут показывать архивные группы (раньше показывали все, включая архивные). Переключателя «показать архивные» в UI пока нет — доступно только через API. Если нужен UI-фильтр — отдельная фронтенд-задача.
- ~~`slug` уникален в рамках организации — риск конфликта при переименовании из-за внешних ссылок~~ — **закрыто, при перепроверке не подтвердилось.** Группы нигде не роутятся по slug ни в бэкенде, ни во фронтенде (везде используется `id`) — внешних ссылок на slug группы не существует, конфликтовать нечему. Код не менялся.

---

## 6. GroupMember
**Модель данных:** составной PK `[groupId, userId]`, `organizationId, createdAt, deletedAt`. `onDelete: Cascade` и от `Group`, и от `User`.

**RBAC:** управляется теми же правилами, что и `Group` (admin/manager); напрямую в матрице отдельной строки нет — часть операций над группами.

**Edge cases:** проверены (2026-08-08) — обе не проблема, код не менялся.
- ~~Нужен `upsert`, а не plain `create`, при повторном добавлении после `deletedAt`~~ — **уже реализовано верно.** `GroupsService.addMember` использует `groupMember.upsert(..., update: { deletedAt: null })`. Оставшаяся часть («нет полной истории вступлений/выходов, только текущее состояние») — не локальный баг, а часть уже отдельно зафиксированного открытого пробела «нет Audit Log» в `docs/CONCERNS.md`, не специфично для `GroupMember`.
- ~~Каскад при физическом удалении пользователя~~ — **закрыто, при перепроверке не подтвердилось.** Физического удаления пользователя в API не существует вообще (нет `@Delete`-эндпоинта у `users.controller.ts`, нет вызовов `user.delete(...)` в коде) — проблема нереализуема, вызвать её нечем.

---

## 7. ManagerGroup
**Модель данных:** составной PK `[groupId, managerId]`, `organizationId, createdAt, deletedAt`. `onDelete: Cascade` от `Group` и `User` (менеджер).

**RBAC:** управляется на уровне назначения через admin/manager-доступ к группам; используется сервисным слоем для построения scope менеджера («manager team summary» — отдельная политика `Manager team summary — read: ✓ admin ✓ manager`).

**Edge cases:** проверены (2026-08-08) — обе не проблема, код не менялся.
- Менеджер закрепляется за группой, а не строит организационную иерархию (в отличие от отсутствующей в проекте `Manager Hierarchy`, п. 1.4 нереализованных) — **дизайн-решение**, прямо сравнивается с несуществующей фичей в исходной формулировке.
- ~~Агрегация «моя команда» должна объединять учеников по всем группам менеджера, не только по последней~~ — **уже реализовано верно.** `ManagerTeamScope.user()` (используется в `ManagerService.getTeamSummary` и везде через `teamScope.user(actor)`) строит фильтр `groupMemberships: { some: { group: { managers: { some: {...} } } } }` — вложенный `some`/`some` уже агрегирует по всем группам менеджера, не только по одной.

---

## 8. Course
**Модель данных:** `id, organizationId (FK Cascade), title, slug, description?, category?, durationMinutes?, status (draft/published/archived), selfEnrollmentEnabled (Boolean, default false — добавлено 2026-08-08), createdAt/updatedAt, deletedAt`. Уникальность `[organizationId, slug]`.

**RBAC:** все роли — read (`Courses — read: ✓ admin ✓ manager ✓ instructor ✓ learner`); create/update/delete — только admin и instructor (`✓ admin, ✓ instructor`, manager/learner — нет). Дополнительно объектный `CourseAccessGuard`: instructor видит/меняет только свои курсы (через `CourseInstructor`), admin — без ограничения scope.

**Edge cases:**
- **Подтверждённый открытый concern (`docs/CONCERNS.md`):** `createCourse` + `assignInstructor` выполняются без транзакции — если второй шаг падает, курс создан без инструктора и создатель-инструктор больше не видит его в своём списке (из-за `CourseAccessGuard`, который фильтрует по `CourseInstructor`).
- Instructor-фронтенд на текущий момент (по тому же документу) запрашивает курсы без явной фильтрации по владельцу на уровне API-вызова UI (`listCourses({ pageSize: 200 })`) — то есть API-сайд ownership есть, но фронтенд ещё не обновлён под него на части экранов.
- `status: draft` курс не должен быть виден `learner` в каталоге, но модель не содержит отдельного флага видимости — контроль полностью на уровне бизнес-логики контроллера, не на уровне схемы.

---

## 9. CourseInstructor
**Модель данных:** составной PK `[courseId, instructorId]`, `organizationId, assignedAt, deletedAt`. `onDelete: Cascade` от `Course` и `User`.

**RBAC:** управляется через admin/instructor-доступ к курсам; напрямую формирует scope для `CourseAccessGuard` — от этой таблицы зависит, какие курсы видит конкретный instructor.

**Edge cases:**
- Единственная связка «курс ↔ владеющий инструктор» — если инструктор увольняется/деактивируется, курс не переназначается автоматически другому инструктору, рискуя остаться «бесхозным» для UI-сценариев, завязанных на ownership.
- Составной PK не хранит роль/тип участия инструктора (основной/со-ведущий) — все инструкторы курса равноправны в текущей модели.

---

## 10. Lesson
**Модель данных:** `id, organizationId, courseId (FK Cascade), title, slug, description?, type (default "text"), order (Int), status (draft/published/archived), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update/delete — admin/instructor (та же матрица, что и Course), с тем же объектным ограничением через `CourseAccessGuard` (доступ к уроку резолвится через принадлежность к курсу).

**Edge cases:**
- `type` — свободная строка (`String`, не enum) со значением по умолчанию `"text"` — нет валидации на уровне схемы, какие типы уроков вообще допустимы; расхождение в написании типа на разных этапах (`"video"` vs `"Video"`) не будет поймано БД.
- `order` — просто `Int`, без уникальности в рамках курса — два урока с одинаковым `order` возможны на уровне БД, сортировка на фронтенде должна быть детерминированной (например, добавлять `id` как вторичный ключ сортировки) на случай коллизии.
- Нет модели `Module` (см. п. 2.1 нереализованных) — все уроки курса плоские, без промежуточной группировки.

---

## 11. CourseMaterial
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), title, slug, description?, kind (file/link), fileName?, fileUrl?, objectKey? (unique), quarantineKey? (unique), mimeType?, sizeBytes?, scanStatus? (pending/scanning/available/rejected), scanReason?, scanExpiresAt?, scannedAt?, status (active/archived), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update (включая загрузку) — admin/instructor.

**Edge cases:**
- **Подтверждённый открытый concern:** S3/R2-инфраструктура на Railway не настроена — код загрузки написан (`objectKey`/`quarantineKey`/malware-scan pipeline), но бакет и env-переменные отсутствуют, поэтому функциональность загрузки материалов сейчас нерабочая в проде.
- `scanStatus: rejected` — материал не прошёл проверку на вредоносность; модель не содержит явного правила автоочистки отклонённых файлов из `quarantineKey`-хранилища по истечении `scanExpiresAt`.
- `lessonId` опционален (`SetNull` при удалении урока) — материал может «пережить» удаление своего урока и остаться привязанным только к курсу, что нужно явно отражать в UI (материал без урока — не баг).

---

## 12. MultipartUpload
**Модель данных:** `id, uploadId (unique), organizationId, materialId (FK Cascade), objectKey (unique), fileName, mimeType, sizeBytes, partSizeBytes, status (pending/completed/aborted), expiresAt, completedAt?, createdAt/updatedAt`.

**RBAC:** служебная сущность, используется только внутри процесса загрузки материала (12.1) — прямых самостоятельных RBAC-правил в матрице нет, наследует права от `CourseMaterial`-загрузки (admin/instructor).

**Edge cases:**
- `status: pending`, не завершённый до `expiresAt` — модель не содержит триггера автоматического перевода в `aborted`; нужен периодический job, иначе зависшие multipart-загрузки остаются в БД и потенциально — недозагруженными частями в хранилище (лишний расход места на стороне S3/R2).
- Прямая зависимость от нерабочей пока S3/R2-инфраструктуры (см. п. 11) — вся эта модель функционально неактивна в проде до решения того concern.

---

## 13. Assignment
**Модель данных:** `id, organizationId (FK Cascade), courseId (FK Cascade), userId? (FK Restrict), groupId? (FK Restrict), status (assigned/completed/cancelled), dueAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** все роли — read; create/update — admin/manager/instructor (`✓ admin ✓ manager ✓ instructor`), learner не может сам себе назначать курс (нет self-enrollment, см. п. 3.1 нереализованных `Enrollment`).

**Edge cases:**
- ~~И `userId`, и `groupId` опциональны одновременно — схема физически допускает `Assignment` без цели~~ — **неверно (уточнено 2026-08-08):** валидация уже есть — `createAssignmentSchema` (`assignments.schemas.ts`) содержит `.refine((input) => Boolean(input.userId) !== Boolean(input.groupId), ...)` с первого коммита файла, и контроллер парсит тело именно этой схемой перед вызовом сервиса. На уровне БД действительно не гарантировано (оба поля nullable), но на уровне API — гарантировано.
- **Подтверждённый открытый concern (`docs/CONCERNS.md`):** `assertResourceAccess` для вложенных ресурсов (attempt/question) делает 2 последовательных запроса вместо одного JOIN — при высокой нагрузке заметно; напрямую влияет на производительность проверки доступа к назначениям через вложенные сущности.
- `onDelete: Restrict` на `userId`/`groupId` — нельзя удалить пользователя/группу, пока есть активные назначения; требует явного порядка операций (сначала снять/завершить назначения) при офбординге сотрудника.

---

## 14. Progress
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), userId (FK Restrict), status (not_started/in_progress/completed), score?, completedAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** все роли — read/create (`Progress — read/create: ✓` для всех 4 ролей) — то есть learner может сам создавать/обновлять свой прогресс напрямую через API.

**Edge cases:**
- Нет отдельной неизменяемой записи о завершении (см. п. 3.4 `Completion Record` нереализованных) — `Progress` может теоретически быть изменён/пересчитан после факта, юридически значимого «снимка на момент завершения» не существует.
- ~~Поскольку `learner` сам может создавать `Progress`, нужна серверная валидация, что прогресс создаётся только по курсам, на которые у пользователя есть активный `Assignment`/доступ~~ — **закрыто (2026-08-08):** `ProgressService.createProgress` теперь для learner-only акторов требует либо активное `Assignment` (прямое на пользователя, либо через группу — `GroupMember`), либо флаг `Course.selfEnrollmentEnabled = true` (новое поле, миграция `20260808070000_add_course_self_enrollment`). Без обоих условий — `ForbiddenException`. Для admin/manager/instructor проверка не применяется (доверенное ручное простановление прогресса, как и раньше). Тумблер самозаписи включается через `updateCourse` (`selfEnrollmentEnabled` в теле запроса) — UI-переключателя в админке пока нет, только API.
- `lessonId` опционален — `Progress` может быть как по уроку, так и агрегированно по курсу целиком; логика агрегации курсового прогресса из построчных урочных записей должна быть согласованной (не задвоенный подсчёт).

---

## 15. Assessment
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), title, slug, description?, status (draft/published/archived), passingScore (default 70), maxAttempts?, availableAfterCourseCompletion (default true), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update — admin/instructor (та же логика ownership через `CourseAccessGuard`, что и Course/Lesson).

**Edge cases:**
- `maxAttempts` опционален — `null` означает неограниченное число попыток; нужно явно решить, желаемое ли это поведение по умолчанию для всех новых тестов, или дефолт должен быть конечным числом.
- `availableAfterCourseCompletion: true` по умолчанию — тест по умолчанию открывается только после завершения курса; тесты, которые должны быть доступны раньше (например, входной placement test, п. 16.2 нереализованных), потребуют явного false и отдельной логики, которой пока нет.
- Нет модели `Question Bank` (п. 4.1 нереализованных) — вопросы жёстко привязаны к конкретному `Assessment`, переиспользование между тестами невозможно без ручного дублирования.

---

## 16. AssessmentQuestion
**Модель данных:** `id, organizationId, assessmentId (FK Cascade), type (single_choice/multiple_choice/true_false), title, text?, imageUrl?, points (default 1), order, createdAt/updatedAt, deletedAt`.

**RBAC:** read — admin/manager/instructor (learner не имеет прямого read к вопросам вне контекста попытки — `Assessment questions/options — read: ✓ admin ✓ manager ✓ instructor`, без learner); create — admin/instructor.

**Edge cases:**
- Learner явно исключён из прямого read вопросов — это осознанное ограничение (иначе можно было бы посмотреть правильные ответы до попытки), но означает, что весь показ вопросов ученику должен идти через отдельный, более узкий эндпоинт попытки, а не через общий CRUD.
- `points` независим от количества вариантов ответа — при `multiple_choice` схема не задаёт правило начисления баллов за частично правильный ответ, это должно быть решено на уровне бизнес-логики подсчёта в `AssessmentAttemptAnswer`.

---

## 17. AssessmentAnswerOption
**Модель данных:** `id, organizationId, questionId (FK Cascade), text?, imageUrl?, isCorrect (default false), order, createdAt/updatedAt, deletedAt`.

**RBAC:** аналогично `AssessmentQuestion` — read admin/manager/instructor, create admin/instructor, без прямого доступа learner.

**Edge cases:**
- `isCorrect` хранится прямо на варианте ответа, доступном через обычный `read` для manager/instructor — при отдаче вопросов ученику (через отдельный, ограниченный эндпоинт попытки) нужно явно убедиться, что поле `isCorrect` не утекает в ответ API до завершения попытки.
- Ни один вариант вопроса не помечен `isCorrect: true` — валидация целостности теста (хотя бы один правильный вариант обязателен) должна быть на уровне приложения при публикации `Assessment`, схема это не гарантирует.

---

## 18. AssessmentAttempt
**Модель данных:** `id, organizationId, assessmentId (FK Cascade), userId (FK Restrict), status (единственное значение enum: completed), score (default 0), maxScore (default 0), percentage (default 0), passed (default false), startedAt, completedAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** read (список попыток) — admin/manager/instructor, без learner; read результатов конкретной попытки — все роли; create (начать/сдать попытку) — все роли, включая learner.

**Edge cases:**
- **Важное структурное наблюдение:** `AssessmentAttemptStatus` enum содержит только одно значение — `completed`. Это означает, что модель на уровне схемы не различает «попытка в процессе» и «попытка завершена» — вероятно, API создаёт запись только по факту полной сдачи, без промежуточного состояния. Любая будущая фича «сохранить прогресс теста и вернуться позже» потребует добавления нового статуса (например, `in_progress`) — сейчас это не предусмотрено.
- `maxAttempts` у родительского `Assessment` опционален — enforcement лимита попыток целиком на уровне бизнес-логики контроллера при создании новой попытки, не на уровне БД.
- Прямая зависимость от 2-запросного `assertResourceAccess` (см. п. 13 Assignment) — попытки теста тоже вложенный ресурс, подверженный той же проблеме производительности.

---

## 19. AssessmentAttemptAnswer
**Модель данных:** `id, organizationId, attemptId (FK Cascade), questionId (FK Restrict), selectedOptionId? (FK SetNull), selectedOptionIds? (Json, для multiple_choice), isCorrect (default false), score (default 0), createdAt/updatedAt, deletedAt`.

**RBAC:** наследует доступ через `AssessmentAttempt` — read результатов доступен ученику по своей попытке, admin/manager/instructor — по попыткам в scope их курсов.

**Edge cases:**
- Два разных механизма хранения выбора: `selectedOptionId` (одиночный FK, для single_choice/true_false) и `selectedOptionIds` (Json-массив, для multiple_choice) — приложение должно консистентно знать, какое поле читать в зависимости от `AssessmentQuestion.type`, схема сама это не enforce-ит; риск рассинхронизации при изменении типа вопроса после того как на него уже есть ответы.
- `onDelete: Restrict` на `questionId` — нельзя удалить вопрос теста, если по нему уже есть хотя бы один ответ в истории попыток; это защищает целостность истории, но означает, что «удаление» вопроса из уже когда-либо пройденного теста требует soft-delete/архивации, а не физического удаления.

---

## 20. Certificate
**Модель данных:** `id, organizationId, courseId (FK Cascade), userId (FK Restrict), assessmentAttemptId? (FK SetNull), status (issued/revoked), issuedAt, revokedAt?, createdAt/updatedAt, deletedAt`. Уникальность `[organizationId, courseId, userId]` — один сертификат на пару курс+пользователь в организации.

**RBAC:** все роли — read; create (выдача) — admin/manager/instructor, learner не может выдать сертификат сам себе.

**Edge cases:**
- Уникальность `[organizationId, courseId, userId]` означает, что при повторном прохождении курса (пересдача обязательного обучения, см. п. 3.5 нереализованных `Due Date Policy/Recurrence`) новый сертификат не может быть создан отдельной строкой — либо нужен `upsert`/обновление существующей записи (теряя историю прошлой выдачи), либо ограничение придётся снимать при реализации периодических пересдач.
- Нет модели `Certificate Template` (п. 4.2 нереализованных) — оформление сертификата, судя по всему, зашито вне модели данных (в рендере), сменить дизайн без деплоя нельзя.
- `assessmentAttemptId` опционален — сертификат может быть выдан без прохождения теста (например, за само завершение курса), это разные бизнес-сценарии, которые модель не различает явным полем «основание выдачи».

---

## 21. MaterialFileDeletionAudit
**Модель данных:** `id, organizationId, materialId, actorId, objectKeys (String[]), result, createdAt`. Только `create`/`read`, нет `updatedAt`/`deletedAt` — по духу append-only лог.

**RBAC:** нет отдельной строки в публичной RBAC-матрице — служебная модель, заполняется системой при удалении файла материала; чтение, вероятно, доступно только admin (в рамках общего аудита), но выделенного эндпоинта для чтения этого лога в текущей матрице не описано отдельно.

**Edge cases:**
- **Известный, зафиксированный как открытый в `docs/CONCERNS.md` пробел:** это единственный существующий аудит-лог в системе — покрывает только удаление файлов материалов, но не остальные значимые действия (смена ролей, публикация курсов, попытки тестов, выдача сертификатов), которые требует `docs/MVP_SCOPE_LOCK.md` как критерий готовности MVP. По сути, это узкий частный случай общего `Audit Log` (п. 10.1 нереализованных), реализованный точечно для одной операции.
- Нет `actorId` внешнего ключа с `onDelete`-политикой на `User` в явном виде в приведённом фрагменте связи — если пользователь удалён физически, запись аудита может остаться с «висящим» `actorId` без ссылочной целостности на уровне Prisma-связи (в отличие от остальных моделей, где связь explicit).

---

## Сквозные наблюдения по уже реализованной части схемы

1. **Единый паттерн soft-delete:** почти все 21 модель используют `deletedAt: DateTime?` вместо физического удаления — кроме `Session` (только `revokedAt`, не `deletedAt`) и `MaterialFileDeletionAudit`/`Membership` (append-only, без `deletedAt` вовсе). Это стоит держать в уме как эталон для 99 нереализованных сущностей — там, где нужна история (Completion Record, Consent Record и т.д.), паттерн `MaterialFileDeletionAudit`/`Membership` (append-only без deletedAt) ближе к правильному, чем soft-delete.
2. **`organizationId` дублируется на каждой модели**, а не выводится только через связи — это сознательный паттерн для упрощения индексов и RLS-подобной фильтрации (`@@index([organizationId, ...])` почти везде). Новые сущности должны следовать этому же паттерну, а не полагаться на JOIN до организации через промежуточные связи.
3. **`CourseAccessGuard` — единственный объектный guard** в системе, покрывающий 8 контроллеров вокруг курса. Любая новая сущность, вложенная в курс (Module, Question Bank и т.п. из списка 99), потребует либо расширения этого guard, либо явного повторения его логики — рассинхронизация здесь уже один раз создавала open concern (двойной запрос в `assertResourceAccess`).
4. **`docs/API_RBAC_MATRIX.md` — best-effort зеркало кода, не источник истины** (это по-прежнему верно для самого doc-файла). Но `roles.spec.ts` больше не входит в эту категорию — **закрыто (2026-08-08)**: тест теперь проверяет `Object.keys(rolePolicies)` целиком (runtime-сравнение с `expectedRolePolicies`), а не захардкоженный список, поэтому исторический дрейф с `themeSettingsRead`/`managerTeamSummaryRead` структурно закрыт — новая политика без ожидания в тесте валит именно этот тест (не `tsc` — `apps/api/tsconfig.json` исключает `*.spec.ts` из typecheck, так что заявленная было compile-time защита через `satisfies` тут не работает, проверено на практике). При реализации любой из 99 нереализованных сущностей стоит сразу заводить запись и в `expectedRolePolicies`, и в `API_RBAC_MATRIX.md` — тест поймает первое, второе всё ещё нужно не забыть руками.
5. **Единственный enum-статус попытки теста (`completed`)** — сигнал, что текущая модель прохождения тестов спроектирована как «одномоментная сдача», без черновиков/пауз. Это ограничивает будущие функции вроде Proctoring Session (п. 17.3 нереализованных) или простого «сохранить и продолжить позже» без миграции схемы.

---

*Документ основан на реальном состоянии `apps/api/prisma/schema.prisma` и `docs/API_RBAC_MATRIX.md` на 2026-08-07. При любых последующих миграциях схемы или изменениях `roles.ts` документ может устареть — сверяться с кодом, не с этим файлом, как того требует `CLAUDE.md`.*
