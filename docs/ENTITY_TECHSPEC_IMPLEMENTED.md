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

**Edge cases:** все три проверены/закрыты.
- ~~`createCourse` + `assignInstructor` без транзакции~~ — **закрыто (2026-08-07, PR #515)**: обёрнуто в `$transaction`. (Эта секция документа не обновлялась вовремя — фикс был раньше, отметка запоздала.)
- ~~Instructor-фронтенд запрашивает курсы без фильтрации по владельцу~~ — **закрыто, при перепроверке не подтвердилось (2026-08-07, PR #515)**: API уже скоуп ит по `instructorId` автоматически, фронтенду ничего передавать не нужно.
- ~~`status: draft` курс не должен быть виден `learner`, но фильтра нет~~ — **закрыто (2026-08-08):** подтверждён реальный гэп — ни `listCourses`, ни `getCourse` не фильтровали по `status` вообще, learner мог получить полный список курсов организации включая черновики (и напрямую запросить draft-курс по id, зная UUID — полные `title`/`description` утекали в ответе). Добавлен параметр `hideDrafts` (`status: { not: 'draft' }`), включается для learner-only акторов (`isLearnerOnly(user.roles)`) в контроллере. Admin/manager/instructor видят черновики как раньше — им это нужно для управления.

---

## 9. CourseInstructor
**Модель данных:** составной PK `[courseId, instructorId]`, `organizationId, assignedAt, deletedAt`. `onDelete: Cascade` от `Course` и `User`.

**RBAC:** управляется через admin/instructor-доступ к курсам; напрямую формирует scope для `CourseAccessGuard` — от этой таблицы зависит, какие курсы видит конкретный instructor.

**Edge cases:** проверены (2026-08-08).
- **Частично закрыто:** курс не переназначается автоматически другому инструктору при деактивации — подтверждено, это осталось так по product-решению (авто-переназначение не требуется). Вместо этого добавлено уведомление: `UsersService.updateUserStatus` при переводе пользователя в любой статус кроме `active` дополнительно проверяет, является ли он единственным активным `CourseInstructor` на каких-либо курсах, и возвращает в ответе API `orphanedCourses: [{id, title}]` — admin, выполняющий деактивацию, сразу видит какие курсы остались без доступного владельца и может назначить нового инструктора через `POST /courses/:id/instructors`. Без email/уведомлений — в проекте нет инфраструктуры рассылок, решение через API-ответ, нулевая стоимость.
- Составной PK не хранит роль/тип участия инструктора (основной/со-ведущий) — все инструкторы курса равноправны в текущей модели. Подтверждено, осталось как есть — доп. роль инструктора в объём этой задачи не входила.

---

## 10. Lesson
**Модель данных:** `id, organizationId, courseId (FK Cascade), title, slug, description?, type (default "text"), order (Int), status (draft/published/archived), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update/delete — admin/instructor (та же матрица, что и Course), с тем же объектным ограничением через `CourseAccessGuard` (доступ к уроку резолвится через принадлежность к курсу).

**Edge cases:** проверены (2026-08-08).
- ~~`type` — свободная строка без валидации~~ — **закрыто, при перепроверке не подтвердилось.** В БД `type` действительно `String`, но на уровне API валидируется через `lessonTypeSchema = z.enum([...])` в `createLessonSchema` и `updateLessonSchema` — опечатка/регистр отклоняется Zod до записи в БД. Риск есть только при обходе API (прямая запись в БД), это общее свойство схемы, не специфика Lesson.
- `order` без уникальности в рамках курса — подтверждено на уровне БД (`createLesson`/`updateLesson` не проверяют коллизии, дефолт `0`). Но детерминированность сортировки при коллизии, о которой и предупреждал этот пункт, уже обеспечена с двух сторон: backend `listLessons` — `orderBy: [{order: asc}, {createdAt: desc}]`, frontend `sortLessons()` — тай-брейк по `title`. Практический риск (нестабильный порядок в UI) закрыт, формальное отсутствие DB-уникальности остаётся осознанно (как и предполагалось).
- Нет модели `Module` (см. п. 2.1 нереализованных) — все уроки курса плоские, без промежуточной группировки. Подтверждено, будущая фича, код не менялся.

---

## 11. CourseMaterial
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), title, slug, description?, kind (file/link), fileName?, fileUrl?, objectKey? (unique), quarantineKey? (unique), mimeType?, sizeBytes?, scanStatus? (pending/scanning/available/rejected), scanReason?, scanExpiresAt?, scannedAt?, status (active/archived), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update/delete/reassign-to-lesson (включая загрузку) — admin/instructor.
- **(2026-08-08) Добавлено:** `DELETE /materials/:id` — полное (soft-delete) удаление записи материала, ранее существовал только `DELETE /materials/:id/file` (удаляет только прикреплённый файл, запись материала оставалась). Перед soft-delete чистит `objectKey`/`quarantineKey` в хранилище, как и `deleteMaterialFile`.
- **(2026-08-08) Добавлено:** `lessonId` теперь можно менять через `PATCH /materials/:id` (назначение материала на урок, переназначение на другой урок курса, снятие привязки через `lessonId: null`). Новый `lessonId` валидируется — должен принадлежать тому же курсу, что и материал (переиспользует существующую `ensureLessonBelongsToCourse`). Ранее `lessonId` можно было задать только один раз, при создании.

**Edge cases:** проверены (2026-08-08).
- **Открытый concern (не проверялся в этом заходе):** S3/R2-инфраструктура на Railway не настроена — код загрузки написан (`objectKey`/`quarantineKey`/malware-scan pipeline), но бакет и env-переменные отсутствуют, поэтому функциональность загрузки материалов сейчас нерабочая в проде.
- ~~`scanStatus: rejected` — нет автоочистки отклонённых файлов~~ — **закрыто, при перепроверке не подтвердилось.** `MaterialMalwareScanService.deleteAndReject`/`recordVerdict` уже удаляют объект из `quarantineKey`-хранилища и обнуляют `quarantineKey` сразу при переводе материала в `rejected` (не откладывая до истечения `scanExpiresAt`). Отдельно есть `MaterialStorageLifecycleService`/`material-storage-cleanup.ts` — периодическая уборка осиротевших объектов в S3, не привязанных ни к одной записи `CourseMaterial` (аналог `session-cleanup`/`multipart-upload-cleanup`, без авто-расписания).
- `lessonId` опционален (`SetNull` при удалении урока) — материал может «пережить» удаление своего урока и остаться привязанным только к курсу, что нужно явно отражать в UI (материал без урока — не баг). Подтверждено, осталось как есть.

---

## 12. MultipartUpload
**Модель данных:** `id, uploadId (unique), organizationId, materialId (FK Cascade), objectKey (unique), fileName, mimeType, sizeBytes, partSizeBytes, status (pending/completed/aborted), expiresAt, completedAt?, createdAt/updatedAt`.

**RBAC:** служебная сущность, используется только внутри процесса загрузки материала (12.1) — прямых самостоятельных RBAC-правил в матрице нет, наследует права от `CourseMaterial`-загрузки (admin/instructor).

**Edge cases:** проверены (2026-08-08).
- ~~`status: pending`, не завершённый до `expiresAt` — нет триггера автоперевода в `aborted`, нужен периодический job~~ — **закрыто, при перепроверке не подтвердилось.** `MaterialMultipartUploadService.cleanupExpired()` уже существует: находит просроченные `pending`-загрузки, вызывает `storage.abortMultipartUpload` и переводит их в `aborted`. Обёрнуто в скрипт `scripts/multipart-upload-cleanup.ts` (`pnpm storage:multipart-cleanup`, dry-run по умолчанию, `--execute` для реального запуска). Не запускается по расписанию (нет cron) — как и `session-cleanup`/`material-storage-cleanup`, сознательно не добавляем платную scheduled-инфраструктуру без отдельного запроса.
- **Открытый concern (не проверялся в этом заходе):** прямая зависимость от нерабочей пока S3/R2-инфраструктуры (см. п. 11) — вся эта модель функционально неактивна в проде до решения того concern.

---

## 13. Assignment
**Модель данных:** `id, organizationId (FK Cascade), courseId (FK Cascade), userId? (FK Restrict), groupId? (FK Restrict), status (assigned/completed/cancelled), dueAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** все роли — read; create/update — admin/manager/instructor (`✓ admin ✓ manager ✓ instructor`), learner не может сам себе назначать курс (нет self-enrollment, см. п. 3.1 нереализованных `Enrollment`).

**Edge cases:** проверены (2026-08-08).
- ~~И `userId`, и `groupId` опциональны одновременно — схема физически допускает `Assignment` без цели~~ — **неверно (уточнено 2026-08-08):** валидация уже есть — `createAssignmentSchema` (`assignments.schemas.ts`) содержит `.refine((input) => Boolean(input.userId) !== Boolean(input.groupId), ...)` с первого коммита файла, и контроллер парсит тело именно этой схемой перед вызовом сервиса. На уровне БД действительно не гарантировано (оба поля nullable), но на уровне API — гарантировано.
- ~~`assertResourceAccess` — 2 последовательных запроса вместо JOIN для вложенных ресурсов~~ — **закрыто (устаревшая запись, реально закрыто 2026-08-07).** Этот пункт дублировал уже закрытый в `docs/CONCERNS.md` concern — `assertResourceAccess` в `course-access.policy.ts` давно переведён на один запрос с вложенным relation-фильтром (`course: courseWhere(user)` / `assessment: { course: ... }`). Секция §13 просто не была обновлена вовремя.
- `onDelete: Restrict` на `userId`/`groupId` — **закрыто, при перепроверке не подтвердилось.** Реального пути достичь этого через приложение сейчас нет: ни у `User`, ни у `Group` нет вообще никакого delete-эндпоинта в API (`UsersService`/`GroupsService` не содержат `delete`) — офбординг сотрудника делается через `PATCH /users/:id/status` (смена статуса, `UPDATE`, не `DELETE`), который `onDelete: Restrict` не блокирует. Ограничение сработает только при прямом `DELETE` в БД в обход API — сейчас такого кода нет.

---

## 14. Progress
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), userId (FK Restrict), status (not_started/in_progress/completed), score?, completedAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** все роли — read/create (`Progress — read/create: ✓` для всех 4 ролей) — то есть learner может сам создавать/обновлять свой прогресс напрямую через API.

**Edge cases:** проверены (2026-08-08).
- Нет отдельной неизменяемой записи о завершении (см. п. 3.4 `Completion Record` нереализованных) — `Progress` может теоретически быть изменён/пересчитан после факта, юридически значимого «снимка на момент завершения» не существует. Подтверждено, будущая фича, без изменений.
- ~~Поскольку `learner` сам может создавать `Progress`, нужна серверная валидация, что прогресс создаётся только по курсам, на которые у пользователя есть активный `Assignment`/доступ~~ — **закрыто (2026-08-08):** `ProgressService.createProgress` теперь для learner-only акторов требует либо активное `Assignment` (прямое на пользователя, либо через группу — `GroupMember`), либо флаг `Course.selfEnrollmentEnabled = true` (новое поле, миграция `20260808070000_add_course_self_enrollment`). Без обоих условий — `ForbiddenException`. Для admin/manager/instructor проверка не применяется (доверенное ручное простановление прогресса, как и раньше). Тумблер самозаписи включается через `updateCourse` (`selfEnrollmentEnabled` в теле запроса) — UI-переключателя в админке пока нет, только API.
- ~~`lessonId` опционален — агрегация курсового прогресса должна быть согласованной (не задвоенный подсчёт)~~ — **закрыто (2026-08-08), при перепроверке оказалось серьёзнее формулировки.** На `Progress` не было `@@unique([courseId, lessonId, userId])` — `createProgress` делал `findFirst` → `create` без транзакции/индекса (race condition, возможны дубли строк при параллельных запросах), а если запись уже существовала, повторный `POST /progress` с другим `status` **молча возвращал старую запись без изменений** — обновления не происходило вообще, `PATCH /progress` не существует. На фронтенде `POST /progress` при этом нигде не вызывается (`apps/web/src/shared/api/progress.ts` — только чтение), т.е. риск был 100% недостижим через UI сегодня, но инфраструктура «отметить урок пройденным» в API была явно неполной.
  Исправлено: добавлен `@@unique([courseId, lessonId, userId])` (миграция `20260808150000_add_progress_unique_target`, с дедупликацией существующих дублей перед созданием индекса), `createProgress` для случая с `lessonId` теперь делает `upsert` по этому ключу — повторный вызов обновляет `status`/`score`/`completedAt` вместо молчаливого игнорирования. Для случая без `lessonId` (курсовой агрегированный прогресс) unique-индекс не применим — Postgres считает `NULL` в `lessonId` различными значениями, поэтому это по-прежнему `find-then-write`, но теперь тоже обновляет статус на повторном вызове (раньше — тоже молча игнорировал).

---

## 15. Assessment
**Модель данных:** `id, organizationId, courseId (FK Cascade), lessonId? (FK SetNull), title, slug, description?, status (draft/published/archived), passingScore (default 70), maxAttempts?, timeLimitMinutes? (2026-08-08, nullable = без лимита), availableAfterCourseCompletion (default true), createdAt/updatedAt, deletedAt`. Уникальность `[courseId, slug]`.

**RBAC:** все роли — read; create/update — admin/instructor (та же логика ownership через `CourseAccessGuard`, что и Course/Lesson).

**Edge cases:** проверены (2026-08-08).
- ~~`maxAttempts` опционален — нужно явно решить дефолтное поведение~~ — **закрыто, при перепроверке не подтвердилось.** Дефолт уже решён и работает: `maxAttempts Int?` без `@default` в схеме → `NULL`, если не задано, а `AssessmentAttemptsService.ensureAttemptsLimit` уже трактует `null`/falsy как «без лимита». Не открытый вопрос — рабочее, осознанное поведение.
- ~~`availableAfterCourseCompletion: true` по умолчанию — тесты, доступные раньше завершения курса (placement test), потребуют отдельной логики, которой нет~~ — **закрыто, при перепроверке не подтвердилось.** Логика уже есть: `ensureAssessmentIsAvailable` при `availableAfterCourseCompletion: false` полностью пропускает проверку завершения курса. Установка флага в `false` при создании теста — это и есть механизм для входного/placement-теста, дополнительный код не нужен.
- Нет модели `Question Bank` (п. 4.1 нереализованных) — вопросы жёстко привязаны к конкретному `Assessment`, переиспользование между тестами невозможно без ручного дублирования. Подтверждено, будущая фича, без изменений.

---

## 16. AssessmentQuestion
**Модель данных:** `id, organizationId, assessmentId (FK Cascade), type (single_choice/multiple_choice/true_false), title, text?, imageUrl?, points (default 1), order, scoringMode (all_or_nothing/proportional/proportional_with_penalty/per_option, default all_or_nothing), createdAt/updatedAt, deletedAt`.

**RBAC:** read — admin/manager/instructor (learner не имеет прямого read к вопросам вне контекста попытки — `Assessment questions/options — read: ✓ admin ✓ manager ✓ instructor`, без learner); create — admin/instructor.

**Edge cases:** проверены (2026-08-08).
- ~~Learner исключён из прямого read вопросов — нужен отдельный узкий эндпоинт попытки~~ — **закрыто, подтверждено уже реализованным правильно.** `GET /assessments/:assessmentId/quiz` (`listLearnerQuizQuestions`, доступен learner через `assessmentsRead`) отдаёт вопросы через отдельный `learnerAssessmentQuestionSelect`, который физически не включает `isCorrect` у вариантов ответа — правильные ответы не попадают в ответ API. Именно то разделение, которое предполагал этот пункт.
- ~~`points` независим от количества вариантов ответа — при `multiple_choice` нет правила частичного начисления~~ — **закрыто (2026-08-08), реализовано по решению пользователя.** Добавлено поле `scoringMode` на `AssessmentQuestion` (миграция `20260808180000_add_assessment_question_scoring_mode`, дефолт `all_or_nothing` — поведение для всех существующих вопросов не меняется). `gradeMultipleChoiceAnswer`/`scoreMultipleChoiceAnswer` (`assessment-attempts.service.ts`) теперь поддерживают 4 схемы начисления для `multiple_choice`:
  - `all_or_nothing` — как раньше, полный балл только при точном совпадении, иначе 0.
  - `proportional` — балл = (верно отмеченные / всего правильных) × `points`, без штрафа за лишнее.
  - `proportional_with_penalty` — балл = max(0, (верно отмеченные − неверно отмеченные) / всего правильных) × `points`.
  - `per_option` — `points` делится поровну между всеми вариантами вопроса; балл начисляется за каждый верно оставленный/отмеченный вариант (и правильно неотмеченный неверный).
  `isCorrect` во всех режимах означает точное совпадение с правильным набором (не «получил хоть какие-то баллы») — используется как раньше для флага полного успеха по вопросу. `single_choice`/`true_false` не затронуты — там всегда всё-или-ничего, `scoringMode` для них не учитывается. Автор теста выбирает режим через `scoringMode` в теле `POST /assessments/:assessmentId/questions` — update-эндпоинта для вопросов пока не существует (as-is, не в объёме этой задачи).

---

## 17. AssessmentAnswerOption
**Модель данных:** `id, organizationId, questionId (FK Cascade), text?, imageUrl?, isCorrect (default false), order, createdAt/updatedAt, deletedAt`.

**RBAC:** аналогично `AssessmentQuestion` — read admin/manager/instructor, create admin/instructor, без прямого доступа learner.

**Edge cases:** проверены (2026-08-08).
- ~~`isCorrect` не должен утекать ученику до/во время попытки~~ — **закрыто, подтверждено уже реализованным правильно.** Прослежен весь код: `learnerAssessmentQuestionSelect` (вопросы для прохождения, §16) без `isCorrect`; `AssessmentResultsService` (результат после завершения попытки) отдаёт `AssessmentAttemptAnswer.isCorrect` (верен ли свой ответ) и текст/картинку выбранного варианта, но нигде не селектит `AssessmentAnswerOption.isCorrect` — ученик не узнаёт, какие варианты были правильными, даже после завершения. Единственный путь к `AssessmentAnswerOption.isCorrect` — `GET /questions/:questionId/options`, RBAC `assessmentAnswerOptionsRead` без learner. Утечки нет.
- ~~Нет валидации «хотя бы один правильный вариант обязателен» при публикации~~ — **закрыто (2026-08-08), реализовано по решению пользователя.** `AssessmentsService.updateAssessmentStatus` при переходе в `published` теперь вызывает `ensureQuestionsHaveCorrectOption` — проверяет каждый активный вопрос теста на наличие хотя бы одного активного варианта с `isCorrect: true`; если хоть один вопрос без правильного варианта — `BadRequestException` со списком названий проблемных вопросов, публикация блокируется. Проверка запускается только при переходе именно в `published` (не при `draft`/`archived`).

---

## 18. AssessmentAttempt
**Модель данных:** `id, organizationId, assessmentId (FK Cascade), userId (FK Restrict), status (in_progress/completed — in_progress добавлен 2026-08-08), score (default 0), maxScore (default 0), percentage (default 0), passed (default false), startedAt, completedAt?, createdAt/updatedAt, deletedAt`.

**RBAC:** read (список попыток) — admin/manager/instructor, без learner; read результатов конкретной попытки — все роли; create (начать/сдать попытку) — все роли, включая learner.
- **(2026-08-08) Добавлено:** `POST /assessments/:id/attempts/start` — та же ролевая политика (`assessmentAttemptsCreate`), что и у отправки ответов.

**Edge cases:** проверены (2026-08-08).
- ~~`AssessmentAttemptStatus` enum содержит только одно значение — `completed`, нет промежуточного состояния~~ — **закрыто (2026-08-08), реализовано по решению пользователя.** Добавлен `timeLimitMinutes Int?` на `Assessment` (nullable = без лимита) и статус `in_progress`. Для тестов **без** лимита времени (подавляющее большинство, поведение по умолчанию не меняется) всё работает как раньше — один вызов `POST /assessments/:id/attempts` сразу создаёт `completed`-попытку. Для тестов **с** лимитом:
  - `POST /assessments/:id/attempts/start` — идемпотентно создаёт (или переиспользует уже существующую) `in_progress`-попытку с серверным `startedAt`; не доверяет часам браузера. Учитывает `maxAttempts` при создании новой (не при резюме существующей).
  - `POST /assessments/:id/attempts` (отправка ответов) — требует существующую `in_progress`-попытку (иначе 400 «Attempt was not started»); переводит её в `completed`, а не создаёт новую запись.
  - **Просроченная отправка (по решению пользователя, вариант b):** если `now − startedAt > timeLimitMinutes`, ответы всё равно принимаются и оцениваются как обычно (`score`/`percentage` считаются честно), но `passed` принудительно `false` независимо от процента — попытка считается использованной (расходуется из `maxAttempts`), не отклоняется.
  - Известное принятое ограничение: если ученик стартовал `in_progress`-попытку и никогда её не отправил (закрыл вкладку), эта попытка навсегда занимает слот в `maxAttempts` — авто-финализации брошенных попыток нет. Не реализовывалось — не было явно запрошено, отдельное решение при необходимости.
- `maxAttempts` у родительского `Assessment` опционален — enforcement лимита попыток целиком на уровне бизнес-логики контроллера при создании новой попытки, не на уровне БД. Подтверждено, работает как задокументировано, не проблема.
- ~~Прямая зависимость от 2-запросного `assertResourceAccess`~~ — **закрыто (устаревшая запись, реально закрыто 2026-08-07, см. §13).** `assertResourceAccess('attempt', ...)` уже использует один запрос с вложенным `assessment: { course: courseWhere(user) }`. Секция §18 просто не была обновлена вовремя, как и §13 ранее.

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
