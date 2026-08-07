# Техспека нереализованных сущностей LMS: модель данных, RBAC, edge cases

Дата: 2026-08-07
Проект: `lms-for-my-using`

Дополняет предыдущие два документа (`lms-unimplemented-entities.md`, `lms-entity-scenarios.md`) недостающими техническими разделами по каждой из 99 сущностей:
- **Модель данных** — концептуально: ключевые поля, связи с существующими моделями (`Organization`, `User`, `Course`, и т.д.), нужные enum-статусы.
- **RBAC** — доступ по существующим ролям `admin / manager / instructor / learner` (где смысла в роли нет — «—»; где нужна новая роль/custom permission — отмечено явно).
- **Edge cases** — граничные и нештатные ситуации, которые нужно явно обработать при реализации.

Нумерация разделов и сущностей сквозная с предыдущими документами.

**Это по-прежнему не техзадание**, а рабочая заготовка для последующей продуктовой и архитектурной проработки перед реализацией — в соответствии с процессом `CLAUDE.md` (исследовать → минимум 2 варианта → выбрать проще).

---

## 1. Идентичность и структура организации

### 1.1 Department / Business Unit
- **Модель данных:** `id, organizationId (FK Organization), name, parentDepartmentId (self FK, опционально для вложенности), status`. Связь `User`/`Membership` → `departmentId` (nullable FK).
- **RBAC:** admin — CRUD внутри своей организации; manager — read своего отдела и подчинённых; instructor/learner — read только своей принадлежности (для отображения в профиле).
- **Edge cases:** удаление отдела с сотрудниками (запретить или требовать явный перенос); циклическая вложенность `parentDepartmentId` (запретить на уровне валидации); отдел без единого руководителя.

### 1.2 Team / Cohort
- **Модель данных:** `id, organizationId, name, startDate, courseIds[] (опционально), status`. Связь many-to-many с `User` через `CohortMember`.
- **RBAC:** admin/manager — CRUD; instructor — read когорт своих курсов; learner — read своего членства.
- **Edge cases:** участник добавлен в 2 когорты с конфликтующими дедлайнами по одному курсу — нужно правило приоритета; когорта без единого стартового курса.

### 1.3 Position / Job Role
- **Модель данных:** `id, organizationId, title, requiredCourseIds[] (или отдельная таблица PositionCourse), status`. Связь `Membership.positionId` (nullable FK).
- **RBAC:** admin — CRUD; manager — read; instructor/learner — read (для понимания, какие курсы обязательны по должности).
- **Edge cases:** список обязательных курсов должности меняется — нужна политика для уже назначенных (ретроактивно или только новым); должность удаляется, пока на неё назначены сотрудники.

### 1.4 Manager Hierarchy
- **Модель данных:** `id, userId (FK User), managerId (self FK User), organizationId, effectiveFrom/effectiveTo` (для истории). Отдельно от `ManagerGroup`.
- **RBAC:** admin — CRUD всей иерархии; manager — read своей ветки (прямые + косвенные подчинённые); learner — нет доступа.
- **Edge cases:** циклическая ссылка (A подчиняется B, B подчиняется A) — запретить; сотрудник временно без руководителя (вакансия) — отчёты не должны падать с ошибкой; смена руководителя — сохранить историю для ретроспективных отчётов.

---

## 2. Контент и учебный план

### 2.1 Module
- **Модель данных:** `id, courseId (FK Course), title, order (int), status`. `Lesson.moduleId` (nullable FK, для обратной совместимости с курсами без модулей).
- **RBAC:** admin/instructor (владелец курса) — CRUD; manager — read; learner — read опубликованных.
- **Edge cases:** урок без модуля в курсе, где остальные уроки в модулях (UI должен показать корректно); удаление модуля с уроками — запретить или каскадно открепить уроки; изменение порядка модулей при параллельном редактировании двумя методистами.

### 2.2 Topic / Unit
- **Модель данных:** `id, lessonId (FK Lesson), title, order, content`. `Progress` детализируется до `unitId` (nullable, для юнит-грануляции) или отдельная `UnitProgress`.
- **RBAC:** как у Lesson — instructor/admin CRUD, learner read + собственный прогресс.
- **Edge cases:** юнит удаляется после того, как часть учеников уже прошла его — прогресс по удалённому юниту не должен ломать общий процент курса; юнит без родительского lessonId.

### 2.3 Learning Path / Curriculum / Program
- **Модель данных:** `id, organizationId, title, courseSequence[] (ordered FK Course), status`. `PathAssignment` аналог `Assignment`, `PathProgress` агрегирует `Progress` по входящим курсам.
- **RBAC:** admin — CRUD; manager — назначение path группе/сотруднику; instructor — read (если ведёт один из курсов path); learner — read своего назначения.
- **Edge cases:** курс из path удаляется/архивируется — путь должен либо блокироваться, либо пропускать шаг; ученик уже проходил один из курсов раньше начала path — нужно правило зачёта; порядок курсов меняется после того, как часть учеников уже в процессе.

### 2.4 Content Library / Content Item
- **Модель данных:** `id, organizationId, type (video/doc/link), storageRef, currentVersionId`. Много-ко-многим с `Lesson`/`CourseMaterial` через `LessonContentItem`.
- **RBAC:** admin/content author — CRUD; instructor — read + привязка к своему курсу; learner — нет прямого доступа (только через урок).
- **Edge cases:** удаление элемента библиотеки, используемого в N курсах — запретить без явного отвязывания или каскадно предупредить; правка элемента меняет уже пройденный учениками контент без версионирования (см. 2.6).

### 2.5 SCORM / xAPI Package
- **Модель данных:** `id, courseMaterialId (FK), manifestData (json), scormVersion, launchUrl, malwareScanStatus` (аналогично существующему `MultipartUpload`/`CourseMaterial`). Отдельная `ScormAttempt` для хранения runtime state (`cmi.*` данные).
- **RBAC:** admin/instructor — загрузка/CRUD; learner — запуск и взаимодействие (без прямого доступа к манифесту).
- **Edge cases:** невалидный/поврежденный zip-манифест — явная ошибка валидации, не общий fail; SCORM 1.2 vs 2004 — разный протокол runtime API, нужно поддерживать оба или явно ограничить; повторный запуск пакета — resume vs restart state.

### 2.6 Content Version / Content Revision
- **Модель данных:** `id, contentItemId/lessonId (FK), versionNumber, snapshotData, authorId (FK User), createdAt`.
- **RBAC:** admin/instructor (владелец) — создание версий, откат; manager/learner — нет доступа к истории версий.
- **Edge cases:** конфликт параллельного редактирования (optimistic locking по versionNumber); откат к версии, ссылающейся на уже удалённый медиа-asset; необходимость ограничить глубину истории (retention policy) чтобы не расти бесконечно.

### 2.7 Category / Tag / Taxonomy
- **Модель данных:** `id, organizationId, name, parentTagId (опционально для иерархии)`. Many-to-many с `Course` через `CourseTag`.
- **RBAC:** admin — CRUD таксономии; instructor — присвоение тегов своему курсу из существующего списка; learner — read/фильтрация.
- **Edge cases:** удаление тега, используемого в N курсах — снять тег со всех или запретить удаление; дублирующиеся теги с разным регистром/опечаткой (нормализация при создании).

### 2.8 Content Author
- **Модель данных:** отдельная роль/флаг у `Membership` (`isContentAuthor: boolean`) либо отдельная связь `Course.authorId`/`Lesson.authorId` (FK User), не пересекающаяся с `CourseInstructor`.
- **RBAC:** admin — назначение роли автора; content author — CRUD своего контента, без прав на проведение курса перед учениками; instructor — read авторства.
- **Edge cases:** один и тот же пользователь одновременно автор и инструктор — обе роли должны работать без конфликта прав; автор уволен — контент остаётся, авторство помечается «бывший сотрудник».

### 2.9 Media Asset
- **Модель данных:** `id, organizationId, type, storageRef, transcodeStatus, currentVersionId`. Many-to-many с `Lesson` через `LessonMediaAsset`.
- **RBAC:** admin/content author — CRUD; instructor — привязка существующего asset к уроку; learner — только просмотр через урок.
- **Edge cases:** asset ещё транскодируется, а урок уже опубликован — нужен статус «обрабатывается» в плеере; удаление asset, используемого в нескольких уроках.

### 2.10 Transcript / Subtitle / Closed Caption
- **Модель данных:** `id, mediaAssetId (FK), language, format (vtt/srt), storageRef`.
- **RBAC:** admin/content author — CRUD; instructor — загрузка для своего курса; learner — read/toggle в плеере.
- **Edge cases:** субтитры рассинхронизированы с видео после его замены новой версией (2.9) — нужна привязка субтитров к конкретной версии asset; отсутствие субтитров на нужном языке — плеер должен явно показать «недоступно», а не скрывать переключатель.

### 2.11 Content Change Log
- **Модель данных:** `id, entityType, entityId, actorId (FK User), action (create/update/delete), diff (json), createdAt` — обобщённая структура, шире чем текущий `MaterialFileDeletionAudit` (тот покрывает только удаление файлов).
- **RBAC:** admin — read всего лога организации; instructor — read лога своего курса; manager/learner — нет доступа.
- **Edge cases:** массовые автоматические правки (импорт) — не должны создавать тысячи мусорных записей, нужна агрегация; diff по бинарным полям (файлам) — хранить ссылку, а не сам файл в логе.

---

## 3. Назначения и прохождение

### 3.1 Enrollment
- **Модель данных:** `id, userId (FK), courseId (FK), status (self_enrolled/pending_approval), enrolledAt`. Отдельно от `Assignment` (директивное назначение).
- **RBAC:** learner — создание своей enrollment (self-service); admin/manager — read/отмена; instructor — read по своему курсу.
- **Edge cases:** курс требует одобрения (см. 8.2) — enrollment создаётся в статусе pending, не сразу active; повторная попытка enrollment на уже пройденный курс — политика (разрешить пересдачу или заблокировать).

### 3.2 Cohort Enrollment
- **Модель данных:** batch-операция поверх 3.1/`Assignment` — `id, cohortId (FK Team/Cohort), courseId, initiatedBy, createdAt`, разворачивается в N индивидуальных `Enrollment`/`Assignment`.
- **RBAC:** admin/manager — инициация; learner — read собственного результата операции.
- **Edge cases:** участник добавлен в когорту после массовой записи — нужен явный «доназначить» отдельным действием; частичный сбой batch-операции (500 из 500 не создались синхронно) — нужна идемпотентность и retry.

### 3.3 Prerequisite
- **Модель данных:** `id, courseId (FK, «требует»), requiredCourseId (FK, «нужно пройти»)`. Граф зависимостей.
- **RBAC:** admin — CRUD; instructor — read/предложение для своего курса (утверждается admin); learner — read (видит, что заблокировано и почему).
- **Edge cases:** циклическая зависимость (A требует B, B требует A) — запретить на уровне валидации; ручной override для конкретного ученика (внешняя квалификация) — нужна отдельная сущность-исключение, не полное снятие правила глобально.

### 3.4 Completion Record
- **Модель данных:** `id, userId, courseId, completedAt, resultSnapshot (json, неизменяемый), assignmentId (FK, к какому назначению относится)`. Append-only, без update.
- **RBAC:** admin/manager — read; instructor — read по своему курсу; learner — read собственных; никто не имеет права на update/delete через обычный API (только через отдельный «аннулировать» с аудитом).
- **Edge cases:** повторное завершение того же курса (пересдача обязательного) — создаётся новая запись, а не перезапись старой; аннулирование записи (нарушение при сдаче) — soft-status, не физическое удаление, для сохранения аудиторского следа.

### 3.5 Due Date Policy / Recurrence
- **Модель данных:** `id, courseId, recurrenceRule (например, RRULE-подобный формат), gracePeriodDays`. Связь с `Assignment` — при срабатывании создаёт новый `Assignment`.
- **RBAC:** admin — CRUD; manager — read; learner — read собственного расписания пересдач.
- **Edge cases:** пользователь неактивен/уволен на момент срабатывания — не создавать новый Assignment; правило меняется, пока уже есть активные назначения по старому правилу — не пересоздавать задним числом.

---

## 4. Тестирование и сертификация

### 4.1 Question Bank
- **Модель данных:** `id, organizationId, topic, questions[] (FK AssessmentQuestion, переиспользуемые)`. `Assessment.selectionRule` (fixed/random-from-bank, count).
- **RBAC:** admin/instructor — CRUD банка; learner — нет доступа к банку напрямую (только к выбранным вопросам в рамках попытки).
- **Edge cases:** банк меньше запрошенного количества вопросов (запросили 10 случайных, в банке 7) — явная ошибка конфигурации теста при публикации, не в рантайме у ученика; правка вопроса в банке во время активной попытки ученика — не должна повлиять на уже начатую попытку.

### 4.2 Certificate Template
- **Модель данных:** `id, organizationId, layoutConfig (json/html), logoRef, isDefault`. `Certificate.templateId` (FK, nullable → default).
- **RBAC:** admin — CRUD; instructor/manager/learner — нет доступа к редактированию, только косвенный просмотр результата.
- **Edge cases:** шаблон удалён/изменён после выдачи сертификатов — уже выданные сертификаты должны рендериться по снимку на момент выдачи, а не по текущему шаблону; невалидный layout (сломанная вёрстка) — валидация перед сохранением, превью обязательно.

### 4.3 Badge / Digital Credential
- **Модель данных:** `id, organizationId, name, criteria (json), imageRef, openBadgeMetadata`. `UserBadge` — `userId, badgeId, issuedAt, evidenceRef`.
- **RBAC:** admin — CRUD критериев; система — автоматическая выдача по достижении критерия; learner — read собственных, публикация вовне (экспорт).
- **Edge cases:** критерий выдачи изменён задним числом — уже выданные значки не отзываются автоматически (нужно явное решение админа); дублирующаяся выдача одного badge одному пользователю — уникальность по (badgeId, userId) или разрешить повторную выдачу с датой.

### 4.4 Grading Rubric
- **Модель данных:** `id, assessmentId/assignmentId (FK), criteria[] (name, maxScore, description)`. `RubricScore` — `submissionId, criterionId, score, graderId`.
- **RBAC:** instructor/admin — CRUD рубрики и выставление оценок; learner — read рубрики до сдачи и итоговой оценки после.
- **Edge cases:** сумма баллов по критериям не совпадает с ожидаемым максимумом рубрики — валидация при создании; несколько проверяющих ставят разные оценки по одному критерию — нужна политика (среднее/финальное слово одного проверяющего).

---

## 5. Социальное и вовлечение

### 5.1 Discussion / Forum / Comment
- **Модель данных:** `id, courseId/lessonId (FK), authorId (FK User), parentCommentId (self FK для тредов), body, status (visible/hidden/deleted)`.
- **RBAC:** learner/instructor — создание комментариев; instructor/admin — модерация (скрыть/удалить любой комментарий в своём курсе); admin — модерация всей организации.
- **Edge cases:** удаление комментария с ответами (тредом) — soft-delete с сохранением структуры треда («комментарий удалён») вместо каскадного удаления; спам/оскорбления — нужен статус модерации и, возможно, rate limit на создание.

### 5.2 Notification
- **Модель данных:** `id, userId (FK), type, payload (json), readAt (nullable), createdAt`.
- **RBAC:** система — создание; learner — read/mark-as-read только собственных; admin — нет доступа к чужим уведомлениям (privacy).
- **Edge cases:** массовая рассылка (когорте из 500) не должна блокировать основной запрос — асинхронная очередь; уведомление о событии, которое уже неактуально к моменту прочтения (курс отменён) — не ломать переход, показывать «событие больше не актуально».

### 5.3 Announcement
- **Модель данных:** `id, organizationId, audienceType (org/group/cohort), audienceId, authorId, body, expiresAt`.
- **RBAC:** admin/manager/instructor (в рамках своей аудитории) — CRUD; learner — read.
- **Edge cases:** объявление без даты истечения — политика по умолчанию (не показывать вечно); аудитория удалена (группа расформирована) до истечения объявления — не должно ломаться отображение у уже увидевших.

### 5.4 Leaderboard / Points / Streak
- **Модель данных:** `PointsLedger — id, userId, amount, reason, createdAt` (append-only журнал начислений, рейтинг — агрегат). `Streak — userId, currentStreak, longestStreak, lastActivityDate`.
- **RBAC:** система — начисление; learner — read собственных баллов, opt-out из публичного рейтинга; admin — конфигурация правил начисления.
- **Edge cases:** пользователь скрыл себя из рейтинга — баллы продолжают начисляться, но не показываются в публичном списке; смена часового пояса ломает подсчёт streak «дней подряд» — нужна фиксация таймзоны организации/пользователя.

### 5.5 Peer Review
- **Модель данных:** `id, submissionId (FK Assignment Submission), reviewerId (FK User), score, feedback, status (assigned/completed/overdue)`.
- **RBAC:** learner — выполнение назначенной проверки, не может видеть, кто проверяет его; instructor — read всех проверок, вмешательство при расхождении.
- **Edge cases:** проверяющий не сдаёт оценку в срок — переназначение на другого рецензента; проверяющий и автор работы — один и тот же человек по ошибке распределения (запретить).

### 5.6 Bookmark / Wishlist
- **Модель данных:** `id, userId (FK), courseId (FK), createdAt` — простая many-to-many связь.
- **RBAC:** learner — CRUD только своих; admin/manager — нет доступа (личное, не управленческое).
- **Edge cases:** курс из избранного снят с публикации/удалён — запись остаётся, но помечается недоступной, не удаляется молча.

---

## 6. ILT (очное обучение)

### 6.1 Live Session / Webinar
- **Модель данных:** `id, courseId (FK), instructorId (FK User), startAt, endAt, meetingUrl, recordingUrl (nullable)`.
- **RBAC:** instructor/admin — CRUD; learner (записанный на курс) — read + подключение по ссылке.
- **Edge cases:** отмена сессии за час до начала — уведомление всем записанным (5.2); сессия пересекается по времени с другой у того же инструктора — предупреждение о конфликте расписания.

### 6.2 Event / Calendar / Session Schedule
- **Модель данных:** агрегирующее представление (view) поверх `Live Session`, `Assignment.dueDate`, `AssessmentAttempt` дедлайнов — не обязательно отдельная таблица, либо `CalendarEvent` как унифицированная проекция.
- **RBAC:** learner — read собственного календаря; instructor/manager — read календаря своих курсов/группы.
- **Edge cases:** экспорт в `.ics` должен обновляться при переносе события (не быть статичным снимком); два события в одном слоте — визуальная пометка конфликта, не блокировка.

### 6.3 Classroom / Room-Resource Booking
- **Модель данных:** `id, organizationId, name, capacity`. `RoomBooking — roomId, liveSessionId, startAt, endAt`.
- **RBAC:** admin/coordinator (возможно новая роль) — CRUD бронирований; instructor — запрос бронирования для своей сессии.
- **Edge cases:** двойное бронирование одной аудитории на пересекающееся время — запрет на уровне constraint, не только UI-проверки; аудитория выведена из эксплуатации с активными будущими бронированиями — нужен процесс переноса.

### 6.4 Attendance Record
- **Модель данных:** `id, liveSessionId (FK), userId (FK), status (present/absent/partial), checkedInAt, checkedBy`.
- **RBAC:** instructor — отметка присутствия своей сессии; learner — read собственной отметки; admin — read по организации (отчётность).
- **Edge cases:** опоздание — частичное присутствие с указанием времени входа, политика зачёта решается на уровне курса, не жёстко в модели; онлайн-чекин без подтверждения инструктора (самоотметка) — риск фальсификации, нужно решить, допустим ли self-checkin.

### 6.5 Waitlist
- **Модель данных:** `id, liveSessionId/courseId (FK), userId (FK), position (int), joinedAt`.
- **RBAC:** learner — вступление/выход из своего листа ожидания; admin/instructor — read, ручное продвижение.
- **Edge cases:** освободившееся место автоматически предлагается первому в очереди с ограничением по времени на подтверждение — если не подтвердил за N часов, место уходит следующему; лист ожидания для отменённого мероприятия — все участники уведомляются и снимаются.

---

## 7. Опросы и обратная связь

### 7.1 Survey / Course Evaluation
- **Модель данных:** `id, courseId (FK), questions[] (json/отдельная таблица), isAnonymous`. `SurveyResponse — surveyId, userId (nullable если anonymous), answers (json), submittedAt`.
- **RBAC:** admin/instructor — CRUD опроса, read агрегированных результатов; learner — заполнение, без доступа к чужим ответам.
- **Edge cases:** анонимный опрос не должен позволять деанонимизацию через связку с `userId` даже для admin (не хранить userId вовсе, а не просто скрывать в UI); повторное прохождение опроса одним пользователем — разрешить или ограничить одним разом.

### 7.2 NPS Feedback / Poll
- **Модель данных:** `id, courseId, score (0-10), comment (nullable), userId, createdAt` — упрощённая версия 7.1 без множества вопросов.
- **RBAC:** learner — создание одного ответа; admin/instructor — read агрегата (NPS-показатель).
- **Edge cases:** повторный показ всплывающего опроса тому, кто уже ответил или явно закрыл — не показывать повторно (флаг «не спрашивать снова» по курсу).

---

## 8. Онбординг и процессы

### 8.1 Onboarding Checklist / New Hire Program
- **Модель данных:** `id, organizationId, name, items[] (тип: course/task/manual, order)`. `ChecklistProgress — userId, itemId, status, completedAt`.
- **RBAC:** admin/HR — CRUD программы; manager — read прогресса своих новичков; learner — read/отметка своих manual-пунктов.
- **Edge cases:** пункт-курс и пункт-ручная задача имеют разную механику завершения — модель должна поддерживать оба типа единообразно; сотрудник переведён на другую программу онбординга посреди прохождения — политика переноса прогресса.

### 8.2 Approval Request / Approval Workflow
- **Модель данных:** `id, requestType, requestId (полиморфная ссылка, напр. на Training Request), requesterId, approverId, status (pending/approved/rejected), comment, stepOrder (для многоступенчатого согласования)`.
- **RBAC:** learner — создание запроса; manager/указанный approver — approve/reject; admin — read всех, эскалация.
- **Edge cases:** согласующий не отвечает дольше N дней — автоэскалация следующему в иерархии (1.4); approver уволен/сменился, пока запрос висит — переназначение запроса новому approver, а не тупик.

### 8.3 Training Request
- **Модель данных:** `id, userId, courseTitle/externalCourseRef, estimatedCost, justification, status`. Связан с `Approval Request` (8.2) как requestType.
- **RBAC:** learner — CRUD собственных заявок (до одобрения); manager — read/инициация approval; admin — read всех по организации.
- **Edge cases:** заявка отклонена — должна остаться в истории, а не удаляться, для последующего анализа паттернов отказов; повторная заявка на то же самое после отказа — не блокировать, но связать с предыдущей для контекста.

### 8.4 Training Budget / Cost Center
- **Модель данных:** `id, departmentId (FK), fiscalYear, totalBudget, spentAmount`. Списание при approve `Training Request`.
- **RBAC:** admin/finance (возможно новая роль) — CRUD бюджета; manager — read бюджета своего отдела; learner — нет доступа.
- **Edge cases:** одобрение заявки, которая превышает остаток бюджета — блокировать или требовать доп. согласование более высокого уровня; конец финансового года — перенос остатка или обнуление, политика должна быть явной, не default.

---

## 9. Компетенции и развитие

### 9.1 Skill / Competency
- **Модель данных:** `id, organizationId, name, category`. Many-to-many с `Course` через `CourseSkill`.
- **RBAC:** admin — CRUD; instructor — привязка навыка к своему курсу; learner — read.
- **Edge cases:** навык используется в матрице компетенций (9.2) — удаление навыка должно предупреждать о зависимостях, не удалять молча.

### 9.2 Skill Matrix / Skill Gap Analysis
- **Модель данных:** `RequiredSkillLevel — positionId/roleId, skillId, requiredLevel`. `UserSkillLevel — userId, skillId, currentLevel, source (self/manager/test), assessedAt`.
- **RBAC:** manager — оценка уровня подчинённых; learner — самооценка + read итоговой матрицы по себе; admin — read по организации.
- **Edge cases:** несколько источников оценки уровня по одному навыку (self vs manager vs тест) расходятся — нужна политика какой считать «текущим» (последний по дате / средневзвешенный).

### 9.3 Career Path / Succession Plan
- **Модель данных:** `id, targetPositionId (FK Position), organizationId`. `SuccessionCandidate — planId, userId, readinessStatus`.
- **RBAC:** admin/HR — CRUD; manager — read по своей команде; learner — обычно без доступа (конфиденциально) или ограниченный read о себе.
- **Edge cases:** кандидат не должен по умолчанию знать о своём включении — видимость статуса кандидату — отдельная настройка, не включена по умолчанию.

### 9.4 Individual Development Plan (IDP)
- **Модель данных:** `id, userId, managerId, goals[] (title, targetDate, linkedCourseIds), status`.
- **RBAC:** learner — read/предложение правок; manager — CRUD совместно с сотрудником (двустороннее согласование); admin — read.
- **Edge cases:** цель IDP становится неактуальной — архивация с сохранением истории, не удаление; IDP не обновлялся год — напоминание руководителю, не автоматическое закрытие.

### 9.5 Goal / OKR
- **Модель данных:** `id, organizationId/teamId, title, period, keyResults[]`. Связь `GoalCourse` many-to-many с `Course`.
- **RBAC:** manager/admin — CRUD; learner — read целей своей команды, если это открытые OKR.
- **Edge cases:** OKR период завершается — привязанные курсы архивируются вместе с целью, но остаются в истории прохождения ученика.

---

## 10. Комплаенс и отчётность

### 10.1 Audit Log
- **Модель данных:** `id, organizationId, actorId (nullable для системных действий), action, entityType, entityId, before (json), after (json), ip, createdAt`. Append-only, партиционирование по дате для производительности.
- **RBAC:** admin — read (возможно с ограничением на security-critical подмножество отдельной ролью); никто, включая admin, не имеет права update/delete записей.
- **Edge cases:** объём лога растёт неограниченно — нужна retention policy (10.6) и архивация; логирование самого факта чтения лога (мета-аудит) для расследования злоупотреблений доступом; PII в логе (пароли, токены) — обязательная фильтрация перед записью.

### 10.2 Compliance Requirement
- **Модель данных:** `id, organizationId, title, regulationRef, recurrenceMonths, appliesToPositionIds[]/appliesToAll`. Генерирует `Due Date Policy` (3.5).
- **RBAC:** admin/compliance officer — CRUD; manager — read применимых к команде; learner — read собственных обязательств.
- **Edge cases:** требование меняется (новая периодичность по закону) — применяется к будущим циклам, не переписывает прошлые записи о выполнении задним числом.

### 10.3 Report / Dashboard Definition
- **Модель данных:** `id, ownerId (FK User), organizationId, filters (json), scheduleCron (nullable), recipients[]`.
- **RBAC:** admin/manager — CRUD собственных отчётов; instructor — ограниченный набор отчётов по своим курсам; learner — нет доступа к конструктору отчётов.
- **Edge cases:** отчёт содержит данные, к которым у получателя рассылки больше нет доступа (уволен из компании-получателя) — нужна проверка прав на каждый запуск по расписанию, не только при создании.

### 10.4 Export Job
- **Модель данных:** `id, requesterId, organizationId, type (gdpr/full/report), status (pending/processing/done/failed), resultRef, expiresAt`.
- **RBAC:** любой пользователь — запрос экспорта собственных данных; admin — запрос экспорта по организации (для GDPR data subject request от лица другого).
- **Edge cases:** ссылка на готовый архив должна истекать (не бессрочная выдача PII); job зависает/падает — нужен таймаут и уведомление о неудаче, а не тихое молчание.

### 10.5 Policy Acknowledgement / Consent Record
- **Модель данных:** `id, userId, policyId (FK), policyVersion, acceptedAt, ipAddress`. Append-only.
- **RBAC:** learner — создание своего consent; admin — read по организации (для комплаенс-отчётности), без права редактировать чужие записи.
- **Edge cases:** новая версия политики публикуется — все пользователи должны заново подтвердить, старое согласие не переносится автоматически на новую версию.

### 10.6 Data Retention Policy / Data Subject Request
- **Модель данных:** `RetentionPolicy — entityType, retentionMonths`. `DataSubjectRequest — id, userId, type (export/delete), status, resolvedBy, resolvedAt`.
- **RBAC:** admin (data protection officer) — обработка запросов; пользователь — создание запроса на себя.
- **Edge cases:** удаление конфликтует с обязательным аудиторским хранением (10.1, 3.4 Completion Record) — анонимизация вместо физического удаления там, где хранение юридически обязательно.

### 10.7 Terms Acceptance
- **Модель данных:** `id, userId, termsVersion, acceptedAt`. Аналогична 10.5, но на уровне продукта, не организации.
- **RBAC:** пользователь — своя запись; admin — read (для поддержки).
- **Edge cases:** пользователь не принимает новую версию условий — блокировка доступа к продукту до принятия, с чётким UX, что именно требуется.

---

## 11. Коммерция

### 11.1 Subscription / Plan / Invoice / Payment
- **Модель данных:** `Subscription — organizationId, planId, status, currentPeriodEnd`. `Invoice — subscriptionId, amount, status, dueDate`. `Payment — invoiceId, provider, providerRef, status`. Расширяет существующий enum `OrganizationPlan`.
- **RBAC:** billing-admin организации — read/оплата; admin платформы — CRUD планов и просмотр всех подписок; остальные роли — нет доступа.
- **Edge cases:** неудачная оплата — грейс-период перед блокировкой функциональности, а не мгновенное отключение; вебхук от платёжного провайдера приходит с задержкой/дублируется — идемпотентная обработка по `providerRef`.

### 11.2 Coupon / Discount
- **Модель данных:** `id, code, discountType (percent/fixed), value, validFrom, validTo, maxRedemptions, redemptionCount`.
- **RBAC:** admin платформы — CRUD; billing-admin организации — применение при оплате.
- **Edge cases:** промокод используется одновременно двумя клиентами при `maxRedemptions=1` (race condition) — атомарная проверка и инкремент на уровне БД; истёкший код — явное сообщение, не тихий отказ применения.

### 11.3 License / Seat
- **Модель данных:** `id, organizationId, vendorContentId, totalSeats, usedSeats`. `SeatAssignment — licenseId, userId, assignedAt`.
- **RBAC:** admin — CRUD и назначение мест; остальные роли — read собственного назначения (learner).
- **Edge cases:** попытка назначить место при `usedSeats == totalSeats` — явная блокировка с предложением докупить, не тихий фейл; освобождение места при увольнении сотрудника — автоматическое, не требующее ручного вмешательства.

### 11.4 External Course / Training Provider
- **Модель данных:** `id, userId, title, providerName, completedAt, certificateRef, verificationStatus (unverified/pending/verified)`.
- **RBAC:** learner — CRUD собственных записей; manager — read + верификация подчинённых; admin — read по организации.
- **Edge cases:** загруженный «сертификат» — не гарантия подлинности, нужен явный статус верификации, а не автоматическое доверие.

### 11.5 Content Marketplace / Catalog
- **Модель данных:** `MarketplaceCourse — id, vendorId, title, price, licenseType`. `OrganizationMarketplacePurchase — organizationId, marketplaceCourseId, purchasedAt, licenseId (FK 11.3)`.
- **RBAC:** admin — просмотр и покупка; остальные роли — read купленного как обычного курса в каталоге.
- **Edge cases:** лицензия на купленный курс истекает — курс скрывается из каталога для новых назначений, но прогресс уже начавших сохраняется, а не обнуляется.

---

## 12. Интеграции и API

### 12.1 SSO Provider / Identity Provider config
- **Модель данных:** `id, organizationId, protocol (saml/oidc), metadataUrl/certs, attributeMapping (json)`.
- **RBAC:** admin организации — CRUD; admin платформы — read/поддержка при настройке.
- **Edge cases:** атрибут email из IdP не совпадает с существующим `User.email` в LMS — политика связывания аккаунтов (auto-link по email vs явное подтверждение); IdP недоступен — должен быть fallback (или явное сообщение «SSO недоступен, обратитесь к администратору»), особенно если пароль отключён.

### 12.2 Webhook / Integration Config
- **Модель данных:** `id, organizationId, eventTypes[], targetUrl, secret (для подписи HMAC), isActive`.
- **RBAC:** admin — CRUD; остальные роли — нет доступа.
- **Edge cases:** URL вебхука указывает на внутренний/приватный адрес (SSRF) — валидация и запрет на приватные IP-диапазоны при сохранении; секрет должен использоваться для подписи payload, чтобы получатель мог верифицировать подлинность.

### 12.3 API Key / Service Account
- **Модель данных:** `id, organizationId, name, hashedKey, scopes[], createdBy, revokedAt (nullable), lastUsedAt`.
- **RBAC:** admin — CRUD и отзыв; остальные роли — нет доступа.
- **Edge cases:** ключ хранится только в виде хэша (как пароль), полный ключ показывается один раз при создании; скомпрометированный ключ — мгновенный отзыв без ожидания истечения TTL.

### 12.4 Import Job / Sync Log
- **Модель данных:** `id, organizationId, sourceType, status, startedAt, finishedAt, stats (json: created/updated/failed)`. `SyncLogEntry — jobId, recordRef, status, errorMessage`.
- **RBAC:** admin — запуск/read; остальные роли — нет доступа.
- **Edge cases:** частичный сбой (часть записей невалидна) — job продолжает обработку остальных, ошибочные записи попадают в отдельный лог для разбора, весь job не должен падать целиком из-за одной плохой строки.

### 12.5 Webhook Delivery Log
- **Модель данных:** `id, webhookConfigId (FK 12.2), eventType, payload, responseStatus, attemptNumber, deliveredAt`.
- **RBAC:** admin — read/повторная отправка; остальные роли — нет доступа.
- **Edge cases:** ретраи должны иметь ограничение по количеству попыток и экспоненциальную задержку, чтобы не заддосить недоступный эндпоинт клиента; payload может содержать чувствительные данные — доступ к логу должен быть так же строг, как к самим данным.

### 12.6 Learning Record Store (xAPI LRS)
- **Модель данных:** `id, actor (json), verb, object (json), result, timestamp, organizationId` — по спецификации xAPI Statement.
- **RBAC:** admin/analytics-role — read; система — write (не напрямую пользователем).
- **Edge cases:** объём statements растёт очень быстро (одно событие на каждое взаимодействие) — нужна отдельная (не основная транзакционная) БД/хранилище с своей retention-политикой.

### 12.7 Analytics Event / Event Stream
- **Модель данных:** обычно не в основной реляционной БД — событийный поток (Kafka/аналог) с последующей агрегацией в BI. Концептуально: `eventType, userId (или анонимизированный), properties (json), timestamp`.
- **RBAC:** admin/analytics-role — read агрегатов, не сырых событий с PII; система — write.
- **Edge cases:** пользователь не дал согласие на трекинг — события не должны отправляться вовсе для него, а не собираться и потом фильтроваться постфактум.

---

## 13. Локализация

### 13.1 Course Translation / Lesson Translation
- **Модель данных:** `id, lessonId (FK), language, translatedContent, sourceContentVersionId (FK 2.6, для отслеживания устаревания перевода), status`.
- **RBAC:** admin/translator (возможно новая роль) — CRUD; learner — read согласно выбранному языку интерфейса.
- **Edge cases:** оригинал обновлён после перевода — перевод должен помечаться «устарел», а не молча показывать неактуальный текст как актуальный; язык перевода отсутствует для конкретного ученика — fallback на язык по умолчанию, не пустой экран.

### 13.2 Glossary Term
- **Модель данных:** `id, organizationId, term, definitions (per language, json)`.
- **RBAC:** admin/translator — CRUD; instructor — read при переводе своего курса; learner — read (опционально, всплывающие подсказки).
- **Edge cases:** термин уточняется — уже переведённые курсы не обновляются автоматически, только предупреждение о расхождении при следующем ревью перевода.

---

## 14. Доступ, безопасность, персонализация

### 14.1 Custom Role / Permission
- **Модель данных:** `Role — id, organizationId, name, isSystem (false для custom)`. `Permission — id, code`. `RolePermission — roleId, permissionId`. `Membership.roleId` вместо/в дополнение к текущему enum `UserRole`.
- **RBAC:** admin — CRUD ролей и назначение permission; остальные роли определяются содержимым конкретной custom-роли.
- **Edge cases:** переход с фиксированного enum на гибкие роли — миграция данных без потери текущих 4 ролей как «системных» ролей по умолчанию; custom-роль получает избыточные права по ошибке — обязательное логирование через 10.1 при любом изменении набора permission.

### 14.2 Device / Trusted Device
- **Модель данных:** `id, userId (FK), sessionId (FK Session), userAgent, ipAddress, firstSeenAt, lastSeenAt, trusted (boolean)`.
- **RBAC:** пользователь — read/отзыв собственных устройств; admin — read устройств для расследования инцидента (с обоснованием, аудируемо).
- **Edge cases:** отзыв устройства должен инвалидировать связанную `Session`/refresh token немедленно, не только визуально скрыть из списка; определение «устройства» по user-agent ненадёжно (можно подделать) — не полагаться на это как единственный security-контроль.

### 14.3 Custom Field Definition
- **Модель данных:** `id, organizationId, entityType (User/Course), fieldName, fieldType, isRequired`. `CustomFieldValue — definitionId, entityId, value`.
- **RBAC:** admin — CRUD определений полей; владелец сущности (learner для своего профиля) — заполнение значения, если поле разрешено для self-edit.
- **Edge cases:** тип поля меняется после того, как уже есть заполненные значения (text → number) — существующие значения могут стать невалидными, нужна политика миграции/предупреждение.

### 14.4 Notification Template / Notification Preference
- **Модель данных:** `NotificationTemplate — id, organizationId, type, subject, body`. `NotificationPreference — userId, notificationType, channel (in_app/email), enabled`.
- **RBAC:** admin — CRUD шаблонов; learner — CRUD собственных предпочтений.
- **Edge cases:** критичные уведомления (например, security-алерт о новом входе) не должны быть полностью отключаемыми пользователем — часть типов должна быть обязательной вне зависимости от `Preference`.

---

## 15. Talent-менеджмент и оценка эффективности

### 15.1 Performance Review
- **Модель данных:** `id, userId, reviewerId, period, criteria[] (score, comment), status (draft/submitted/acknowledged)`.
- **RBAC:** manager — CRUD review своих подчинённых; learner — read + комментарий к своему review, без права редактировать оценки.
- **Edge cases:** сотрудник не согласен с оценкой — отдельное поле для комментария сотрудника, review не редактируется задним числом после подтверждения (immutable после submit).

### 15.2 360-Degree Feedback
- **Модель данных:** `FeedbackCycle — id, subjectUserId, period, status`. `FeedbackResponse — cycleId, respondentId (может быть анонимизирован при отдаче субъекту), relationship (peer/subordinate/manager), answers (json)`.
- **RBAC:** HR/admin — инициация цикла; respondent — заполнение своей формы; subject — read только агрегата, без привязки к конкретному респонденту.
- **Edge cases:** при малом числе респондентов агрегация может деанонимизировать ответ (если только 1 подчинённый) — нужен минимальный порог числа ответов в группе для показа агрегата.

### 15.3 Mentor / Mentee Pairing
- **Модель данных:** `id, mentorId (FK User), menteeId (FK User), programId (опционально FK 8.1), startedAt, status`.
- **RBAC:** admin/HR — CRUD пар; mentor/mentee — read собственной пары.
- **Edge cases:** ограничение на число одновременных менти у одного наставника — валидация при создании пары, не только рекомендация в UI; менти увольняется — пара автоматически завершается, а не висит активной.

### 15.4 Talent Pool / Succession Candidate
- **Модель данных:** расширяет 9.3 — `readinessStatus (ready_now/ready_1y/ready_2y+)`, `visibleToCandidate (boolean)`.
- **RBAC:** HR/admin — CRUD; manager — read кандидатов своей команды; candidate — read только если `visibleToCandidate=true`.
- **Edge cases:** кандидат покидает компанию — исключение из всех pool, но история сохраняется для последующего анализа (кто и когда рассматривался).

---

## 16. Персонализация и AI

### 16.1 Recommendation Engine / Recommended Course
- **Модель данных:** не отдельная таблица данных, а сервис — `RecommendationLog — userId, courseId, reason, shownAt, clicked (boolean)` для оценки качества рекомендаций.
- **RBAC:** система — генерация; learner — read собственных рекомендаций.
- **Edge cases:** холодный старт (новый пользователь без истории) — fallback на популярные курсы по должности, не пустой блок; рекомендация уже пройденного курса — исключить из выдачи.

### 16.2 Placement Test / Adaptive Path
- **Модель данных:** `PlacementTest — id, courseId, questions[]`. `PlacementResult — userId, testId, score, skippedModuleIds[]`.
- **RBAC:** learner — прохождение своего теста; instructor/admin — CRUD теста и read результатов.
- **Edge cases:** ученик может обмануть тест, чтобы пропустить материал — риск принять; если критично, добавить возможность повторно открыть пропущенный модуль вручную.

### 16.3 AI Tutor Session Log
- **Модель данных:** `id, userId, lessonId, messages[] (role, content, timestamp)`.
- **RBAC:** learner — read/продолжение собственного диалога; admin/moderator — read с ограничением (privacy-чувствительные данные, доступ только с обоснованием).
- **Edge cases:** ответ AI содержит некорректную/вредную информацию — нужен механизм модерации/фидбека («пожаловаться на ответ»), не просто хранение лога без контроля качества; хранение диалогов — под тем же GDPR-режимом (10.6), что и остальные персональные данные.

### 16.4 Learner Risk Score
- **Модель данных:** `id, assignmentId (FK), score (0-100), factors (json), calculatedAt`.
- **RBAC:** manager/admin — read; learner — обычно без доступа к своему риск-скору напрямую (во избежание демотивации/манипуляции поведением ради «обмана» алгоритма).
- **Edge cases:** ложноположительный скоринг (сотрудник в отпуске) — возможность вручную пометить назначение как «не требует вмешательства»; модель не должна использовать признаки, ведущие к дискриминации (возраст, пол) — это скорее продуктовое/юридическое ограничение, чем чисто техническое.

---

## 17. Задания и академическая честность

### 17.1 Assignment Submission
- **Модель данных:** `id, assignmentId (FK существующий Assignment либо новая CourseTask), userId, fileRef, submittedAt, status (submitted/late/graded), score, feedback`.
- **RBAC:** learner — создание своей сдачи (до дедлайна и после с пометкой late); instructor — read/оценка сдач своего курса.
- **Edge cases:** повторная пересдача до финального дедлайна — версионирование сдач, а не перезапись; сдача после дедлайна — политика (принять с пометкой/отклонить) должна быть настраиваемой на уровне курса, не жёстко зашитой.

### 17.2 Plagiarism Check Result
- **Модель данных:** `id, submissionId (FK 17.1), similarityScore, matchedSources (json), checkedAt, provider`.
- **RBAC:** instructor — read; learner — обычно без доступа к деталям (во избежание «прогонки» текста через систему для обхода).
- **Edge cases:** сервис проверки временно недоступен — работа всё равно принимается, статус проверки «pending», не блокирует приём сдачи.

### 17.3 Proctoring Session
- **Модель данных:** `id, attemptId (FK AssessmentAttempt), status, flags (json: focus_lost_count, multiple_faces_detected), reviewedBy, reviewStatus`.
- **RBAC:** admin/instructor — read/ревью флагов; learner — согласие на запись перед стартом, без доступа к чужим сессиям.
- **Edge cases:** технически невозможно у ученика (нет камеры/webcam запрещён политикой компании) — альтернативный формат сдачи должен существовать, а не жёсткий блок; ложные срабатывания флагов (сосед прошёл мимо камеры) не должны автоматически аннулировать попытку — только помечать для ручного ревью.

---

## 18. Авторинг и переиспользование контента

### 18.1 Authoring Project / Storyboard
- **Модель данных:** `id, organizationId, ownerId, structure (json draft), publishedCourseId (nullable FK после публикации)`.
- **RBAC:** content author/instructor — CRUD своего проекта; соавторы — по списку collaboratorIds; learner — нет доступа (не опубликовано).
- **Edge cases:** параллельное редактирование двумя соавторами — нужна блокировка секции или merge-стратегия, иначе правки будут теряться при перезаписи.

### 18.2 Interactive Video / H5P Interaction
- **Модель данных:** `id, mediaAssetId (FK 2.9), timestampSeconds, interactionType (quiz/poll), config (json)`. `InteractionResponse — userId, interactionId, response, answeredAt`.
- **RBAC:** instructor/content author — CRUD; learner — прохождение, read собственных ответов.
- **Edge cases:** перемотка видео мимо точки интерактива — прогресс по интерактиву не засчитывается автоматически, требует реального взаимодействия в момент показа.

### 18.3 Course Bundle / Package
- **Модель данных:** `id, organizationId, title, courseIds[]`. При назначении bundle — генерирует N `Assignment`.
- **RBAC:** admin — CRUD; manager — назначение bundle; learner — read своих назначений из bundle как единой сущности с агрегированным прогрессом.
- **Edge cases:** один из курсов bundle уже пройден ранее — засчитывается автоматически, назначаются только недостающие; курс удалён из организации, пока входит в bundle — bundle должен адаптироваться (исключить курс), а не сломаться.

---

## 19. Мультиарендность и брендинг

### 19.1 Reseller / Sub-organization
- **Модель данных:** `Organization.parentOrganizationId` (self FK, nullable) + `Organization.isReseller (boolean)`.
- **RBAC:** reseller-admin — CRUD дочерних организаций и ограниченный read их данных (агрегаты, не PII напрямую); admin дочерней организации — полный контроль внутри своей.
- **Edge cases:** дочерняя организация отсоединяется от реселлера — данные клиента сохраняются, доступ реселлера отзывается немедленно, не постепенно.

### 19.2 Custom Domain Mapping
- **Модель данных:** `id, organizationId, domain, verificationStatus, sslStatus`.
- **RBAC:** admin организации — настройка; admin платформы — read статуса для поддержки.
- **Edge cases:** DNS не настроен корректно — понятный статус ошибки с инструкцией, не generic «failed»; SSL-сертификат для домена не удалось выпустить/просрочен — организация не должна остаться без доступа полностью, нужен fallback на платформенный домен.

### 19.3 Branding Config (Theme)
- **Модель данных:** `id, organizationId, logoRef, primaryColor, accentColor`.
- **RBAC:** admin организации — CRUD; остальные роли — read (применяется автоматически ко всему интерфейсу организации).
- **Edge cases:** выбранные цвета не проходят проверку контрастности (accessibility, WCAG) — предупреждение при сохранении, не блокировка, но с явным указанием проблемы.

---

## 20. Поддержка и база знаний

### 20.1 Help Desk Ticket / Support Request
- **Модель данных:** `id, userId, organizationId, subject, body, status (new/in_progress/resolved), assignedTo`. `TicketMessage — ticketId, authorId, body, createdAt`.
- **RBAC:** learner — создание своих тикетов и переписка по ним; support-роль — read/ответ по всем тикетам организации/платформы.
- **Edge cases:** эскалация тикета в другую очередь (например, разработчикам) — история переписки должна сохраняться целиком, не начинаться заново.

### 20.2 Knowledge Base Article / FAQ
- **Модель данных:** `id, organizationId (nullable для общей платформенной базы), title, body, category, searchKeywords`.
- **RBAC:** admin/support — CRUD; все роли — read (обычно публично внутри организации, без RBAC-ограничений).
- **Edge cases:** статья не даёт ответа по запросу — предложение создать тикет прямо со страницы поиска, чтобы не терять пользователя.

---

## 21. Внешние сертификации и непрерывное образование

### 21.1 External Certification Record
- **Модель данных:** `id, userId, name, issuer, issuedAt, expiresAt (nullable), evidenceRef, verificationStatus`.
- **RBAC:** learner — CRUD собственных; manager — read + верификация подчинённых; admin — read по организации.
- **Edge cases:** файл-подтверждение — не гарантия подлинности, явный статус верификации нужен, чтобы отчётность не путала «заявлено» с «подтверждено».

### 21.2 CEU / Continuing Education Credit
- **Модель данных:** `id, userId, source (courseId/externalCertId), ceuAmount, category, earnedAt`.
- **RBAC:** система — начисление за внутренние курсы; learner — read собственного накопления; admin — конфигурация ceuAmount на курс.
- **Edge cases:** регулятор меняет минимальный порог — применяется к текущему отчётному периоду вперёд, не пересчитывает прошлые периоды задним числом.

### 21.3 License / Certification Expiry Reminder
- **Модель данных:** `ReminderRule — id, daysBeforeExpiry[] (например [60,30,7])`. Триггерит `Notification` (5.2) на основе `expiresAt` из 21.1.
- **RBAC:** система — автоматическая генерация напоминаний; learner — read; manager — опционально копия напоминания для критичных для роли лицензий.
- **Edge cases:** сертификат продлён — цикл напоминаний должен сброситься на новую дату истечения, а не продолжать слать по старому расписанию.

---

## 22. Безопасность доступа (продвинутая)

### 22.1 IP Allowlist / Geofencing Rule
- **Модель данных:** `id, organizationId, cidrRange/countryCode, ruleType (allow/deny)`.
- **RBAC:** admin организации — CRUD; проверяется middleware при каждом запросе аутентификации.
- **Edge cases:** сотрудник в командировке вне разрешённого диапазона — нужен процесс временного исключения (запрос доступа), иначе полная блокировка легитимных пользователей; неверно настроенное правило блокирует самого админа — нужен break-glass механизм восстановления доступа.

### 22.2 Session Recording
- **Модель данных:** `id, proctoringSessionId (FK 17.3), recordingRef, durationSeconds, retentionExpiresAt`.
- **RBAC:** admin/instructor (с обоснованием) — read; learner — согласие перед записью, без доступа к самой записи после.
- **Edge cases:** пользователь не даёт согласие на запись — прокторинг-режим для него недоступен, нужен альтернативный формат сдачи, а не принудительная запись без согласия.

---

## 23. Геймификация (детализация)

### 23.1 Level / Rank
- **Модель данных:** `LevelThreshold — level, minPoints, title`. Вычисляется из `PointsLedger` (5.4), отдельного хранения per-user может не требоваться (derived value), либо кешируется `UserLevel — userId, currentLevel, updatedAt`.
- **RBAC:** система — пересчёт; learner — read собственного уровня; admin — конфигурация порогов.
- **Edge cases:** организация отключает геймификацию — уровни/баллы скрываются полностью, не только визуально, но и из API-ответов для клиентов без этой фичи.

### 23.2 Virtual Currency / Reward Store
- **Модель данных:** `RewardItem — id, name, cost, stock (nullable для нематериальных)`. `RewardRedemption — userId, rewardItemId, pointsCost, status (requested/fulfilled), requestedAt`.
- **RBAC:** learner — просмотр магазина и запрос награды; HR/admin — обработка выполнения (fulfillment).
- **Edge cases:** баллов не хватает — блокировка запроса на уровне API, не только UI-подсказка; race condition при одновременном списании баллов на две разные награды — атомарная проверка баланса.

---

## 24. Мобильное и офлайн

### 24.1 Offline Content Package
- **Модель данных:** `id, courseId, packageRef (bundled zip/manifest), sizeBytes, generatedAt`.
- **RBAC:** learner (записанный на курс) — скачивание; система — генерация пакета.
- **Edge cases:** контент требует сети (живая сессия, внешняя ссылка) — явно помечается недоступным офлайн в манифесте пакета; прогресс, накопленный офлайн, синхронизируется при подключении — нужна обработка конфликтов, если прогресс менялся и на сервере параллельно (например, менеджер вручную зачёл курс).

### 24.2 Push Notification Device Token
- **Модель данных:** `id, userId, platform (ios/android), token, registeredAt, lastUsedAt`.
- **RBAC:** пользователь (через мобильное приложение) — регистрация/удаление своего токена; система — отправка push через сохранённые токены.
- **Edge cases:** токен устарел/приложение удалено — отправка должна gracefully обрабатывать ошибку доставки и деактивировать невалидный токен, а не повторять попытки бесконечно; пользователь отключил push в настройках ОС — токен помечается неактивным, доставка переключается на другие каналы (in-app/email).

---

## Сквозные технические замечания (применимы к большинству разделов выше)

1. **Multi-tenancy:** почти все новые сущности требуют `organizationId` (или наследуют его через связанную сущность) и должны попадать под существующую схему изоляции данных между организациями — как и все 21 текущая модель.
2. **RBAC-паттерн проекта:** судя по `docs/API_RBAC_MATRIX.md` и известной проблеме дрейфа тестов (`docs/CONCERNS.md`, запись от 2026-08-06), любая новая политика доступа должна сразу попадать в матрицу и в тест, сверяемый через `Object.keys(rolePolicies)`, а не захардкоженный список — иначе повторится тот же класс бага.
3. **Аудит:** сущности, связанные с деньгами (11.x), доступом (14.x, 22.x) и комплаенсом (10.x), должны логироваться в `Audit Log` (10.1) с первого дня реализации, а не добавляться позже как заплатка — сейчас в проекте эта проблема уже зафиксирована как открытая.
4. **Мягкое удаление vs жёсткое:** большинство сущностей с историческим/юридическим значением (Completion Record, Consent Record, Audit Log, Completion-связанные) должны быть append-only/soft-delete по умолчанию, а не физически удаляемыми.
5. **Асинхронность массовых операций:** любая batch-операция (Cohort Enrollment, Import Job, Export Job) должна быть асинхронной с отслеживаемым статусом, а не синхронным запросом, блокирующим API — по аналогии с уже существующим `MultipartUpload`.

---

*Документ — рабочая техническая заготовка. Приоритизация, какие из 99 сущностей реализовывать и в каком порядке, требует отдельного продуктового решения (см. `docs/MVP_SCOPE_LOCK.md`).*
