# 04. LMS Database Model Draft

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать черновую модель данных PostgreSQL для MVP и ближайшего расширения.  
**Связь с Этапом 1:** документ опирается на `01_LMS_Master_Product_Specification.md`, `02_LMS_MVP_Roadmap.md` и `03_LMS_Architecture_Map.md`.  
**Архитектура:** modular monolith first.  
**Backend:** TypeScript.  
**Database:** PostgreSQL.  
**Storage:** S3-compatible object storage.

---

## 1. Назначение модели данных

Модель данных должна покрыть минимальный, но полноценный корпоративный learning loop:

```text
организация → пользователи → роли → группы/департаменты → курсы → уроки → назначения → прохождение → тесты → сертификаты → отчёты
```

Главная цель модели — дать AI coding agent и разработчику устойчивую основу для реализации backend, API, frontend и будущего мобильного приложения.

---

## 2. Принципы проектирования базы

### 2.1. Основные правила

1. **PostgreSQL как основной источник истины.**
2. **UUID для публичных идентификаторов.**
3. **Soft delete для бизнес-сущностей**, где важно сохранить историю.
4. **Audit fields во всех ключевых таблицах.**
5. **Tenant-ready модель**, даже если в MVP будет один tenant/organization.
6. **Отдельные таблицы для прогресса, попыток, результатов и сертификатов.**
7. **Файлы не хранить в БД**, хранить только metadata и ключ объекта в S3-compatible storage.
8. **AI-функции не включать в MVP**, но не проектировать БД так, чтобы их было невозможно добавить позже.

### 2.2. Базовые поля

Для большинства таблиц использовать:

```sql
id uuid primary key default gen_random_uuid(),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz null
```

Для сущностей, где нужен автор изменений:

```sql
created_by uuid null references users(id),
updated_by uuid null references users(id)
```

---

## 3. Домены данных

```text
Identity & Access
Organization Structure
Learning Content
Learning Assignment
Learning Progress
Assessment
Certificates
Files & Media
Notifications
Reports & Analytics
Audit & System
```

---

## 4. Identity & Access

### 4.1. `users`

Хранит пользователей LMS.

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Идентификатор пользователя |
| organization_id | uuid | Организация пользователя |
| email | varchar | Email, уникален внутри организации |
| password_hash | text | Хэш пароля |
| first_name | varchar | Имя |
| last_name | varchar | Фамилия |
| middle_name | varchar null | Отчество, опционально |
| phone | varchar null | Телефон |
| avatar_file_id | uuid null | Ссылка на файл аватара |
| status | enum | active / invited / suspended / archived |
| locale | varchar | Например `ru` |
| timezone | varchar | Часовой пояс |
| last_login_at | timestamptz null | Последний вход |
| created_at | timestamptz | Создан |
| updated_at | timestamptz | Обновлён |
| deleted_at | timestamptz null | Soft delete |

**Индексы:**

```sql
unique (organization_id, email)
index (organization_id, status)
index (last_login_at)
```

### 4.2. `roles`

Справочник ролей.

| Роль | Назначение |
|---|---|
| learner | Обучающийся |
| instructor | Автор/преподаватель |
| manager | Руководитель группы/департамента |
| admin | Администратор организации |
| owner | Владелец организации / super admin tenant-а |

### 4.3. `user_roles`

Многие-ко-многим между пользователями и ролями.

| Поле | Тип |
|---|---|
| id | uuid |
| user_id | uuid |
| role_id | uuid |
| organization_id | uuid |
| assigned_by | uuid null |
| created_at | timestamptz |

**Ограничение:**

```sql
unique (organization_id, user_id, role_id)
```

### 4.4. `permissions` и `role_permissions`

В MVP можно начать с фиксированного RBAC в коде. Таблицы permission-уровня можно добавить сразу, если нужна гибкость.

Минимальный подход для MVP:

```text
roles хранятся в БД,
permissions описаны в backend policy layer,
frontend не принимает решений по безопасности самостоятельно.
```

---

## 5. Organization Structure

### 5.1. `organizations`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Организация / tenant |
| name | varchar | Название |
| slug | varchar | Уникальный slug |
| status | enum | active / suspended / archived |
| plan | enum | trial / standard / enterprise |
| created_at | timestamptz | Создана |
| updated_at | timestamptz | Обновлена |

### 5.2. `departments`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Департамент |
| organization_id | uuid | Организация |
| parent_id | uuid null | Вложенность департаментов |
| name | varchar | Название |
| code | varchar null | Код подразделения |
| manager_user_id | uuid null | Ответственный руководитель |
| created_at | timestamptz | Создан |
| updated_at | timestamptz | Обновлён |
| deleted_at | timestamptz null | Soft delete |

### 5.3. `groups`

Группы используются для учебных назначений, потоков, команд или когорт.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| name | varchar |
| description | text null |
| type | enum: cohort / team / custom |
| created_at | timestamptz |
| updated_at | timestamptz |
| deleted_at | timestamptz null |

### 5.4. `group_members`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| group_id | uuid |
| user_id | uuid |
| added_by | uuid null |
| created_at | timestamptz |

**Ограничение:**

```sql
unique (organization_id, group_id, user_id)
```

### 5.5. `user_profiles`

Дополнительные HR/корпоративные поля.

| Поле | Тип |
|---|---|
| id | uuid |
| user_id | uuid unique |
| organization_id | uuid |
| department_id | uuid null |
| position_title | varchar null |
| employee_number | varchar null |
| hire_date | date null |
| manager_user_id | uuid null |
| metadata | jsonb |

---

## 6. Learning Content

### 6.1. `courses`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Курс |
| organization_id | uuid | Организация |
| title | varchar | Название |
| slug | varchar | URL-friendly идентификатор |
| description | text null | Описание |
| cover_file_id | uuid null | Обложка |
| status | enum | draft / published / archived |
| visibility | enum | private / organization / public_link_future |
| difficulty | enum null | beginner / intermediate / advanced |
| estimated_duration_minutes | int null | Оценка длительности |
| created_by | uuid | Автор |
| published_at | timestamptz null | Дата публикации |
| created_at | timestamptz | Создан |
| updated_at | timestamptz | Обновлён |
| deleted_at | timestamptz null | Soft delete |

**Индексы:**

```sql
unique (organization_id, slug)
index (organization_id, status)
index (created_by)
```

### 6.2. `course_modules`

Разделы курса.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| course_id | uuid |
| title | varchar |
| description | text null |
| sort_order | int |
| status | enum: draft / published / archived |
| created_at | timestamptz |
| updated_at | timestamptz |
| deleted_at | timestamptz null |

### 6.3. `lessons`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Урок |
| organization_id | uuid | Организация |
| course_id | uuid | Курс |
| module_id | uuid null | Раздел |
| title | varchar | Название |
| type | enum | text / video / file / quiz / mixed |
| content | jsonb | Структурированный контент урока |
| estimated_duration_minutes | int null | Длительность |
| sort_order | int | Порядок |
| is_required | boolean | Обязательность |
| status | enum | draft / published / archived |
| created_at | timestamptz | Создан |
| updated_at | timestamptz | Обновлён |
| deleted_at | timestamptz null | Soft delete |

**Комментарий:** `content jsonb` может хранить блоки текста, ссылки на файлы, embeds, references на media files.

### 6.4. `course_prerequisites`

На будущее, для зависимостей между курсами.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| course_id | uuid |
| prerequisite_course_id | uuid |
| created_at | timestamptz |

В MVP можно не реализовывать UI, но таблица не мешает future scope.

### 6.5. `course_tags` и `tags`

Используются для каталога, фильтров и будущей аналитики.

---

## 7. Learning Assignment

### 7.1. `course_assignments`

Назначение курса пользователю, группе или департаменту.

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Назначение |
| organization_id | uuid | Организация |
| course_id | uuid | Курс |
| target_type | enum | user / group / department / organization |
| target_user_id | uuid null | Если назначено пользователю |
| target_group_id | uuid null | Если группе |
| target_department_id | uuid null | Если департаменту |
| assigned_by | uuid | Кто назначил |
| due_date | date null | Дедлайн |
| status | enum | active / cancelled / archived |
| created_at | timestamptz | Создано |
| updated_at | timestamptz | Обновлено |

### 7.2. `user_course_enrollments`

Фактическая запись пользователя на курс. Создаётся напрямую или разворачивается из назначения группе/департаменту.

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Enrollment |
| organization_id | uuid | Организация |
| user_id | uuid | Пользователь |
| course_id | uuid | Курс |
| assignment_id | uuid null | Исходное назначение |
| status | enum | not_started / in_progress / completed / overdue / cancelled |
| progress_percent | numeric(5,2) | 0–100 |
| started_at | timestamptz null | Начал |
| completed_at | timestamptz null | Завершил |
| due_date | date null | Дедлайн |
| created_at | timestamptz | Создано |
| updated_at | timestamptz | Обновлено |

**Ограничение:**

```sql
unique (organization_id, user_id, course_id)
```

---

## 8. Learning Progress

### 8.1. `lesson_progress`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Прогресс урока |
| organization_id | uuid | Организация |
| user_id | uuid | Пользователь |
| course_id | uuid | Курс |
| lesson_id | uuid | Урок |
| enrollment_id | uuid | Enrollment |
| status | enum | not_started / in_progress / completed |
| progress_percent | numeric(5,2) | Прогресс |
| time_spent_seconds | int | Время |
| started_at | timestamptz null | Начал |
| completed_at | timestamptz null | Завершил |
| last_position | jsonb null | Позиция видео/контента |
| created_at | timestamptz | Создано |
| updated_at | timestamptz | Обновлено |

**Ограничение:**

```sql
unique (organization_id, user_id, lesson_id)
```

### 8.2. `learning_events`

Событийный журнал обучения для аналитики.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| user_id | uuid |
| course_id | uuid null |
| lesson_id | uuid null |
| event_type | varchar |
| event_payload | jsonb |
| occurred_at | timestamptz |

Примеры `event_type`:

```text
course_started
lesson_opened
lesson_completed
quiz_started
quiz_submitted
course_completed
certificate_issued
```

В MVP можно писать ограниченный набор событий.

---

## 9. Assessment

### 9.1. `assessments`

Тесты/квизы, привязанные к курсу или уроку.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| course_id | uuid null |
| lesson_id | uuid null |
| title | varchar |
| description | text null |
| passing_score_percent | numeric(5,2) |
| max_attempts | int null |
| time_limit_minutes | int null |
| status | enum: draft / published / archived |
| created_at | timestamptz |
| updated_at | timestamptz |
| deleted_at | timestamptz null |

### 9.2. `assessment_questions`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| assessment_id | uuid |
| type | enum: single_choice / multiple_choice / true_false / text_future |
| question_text | text |
| explanation | text null |
| points | numeric(8,2) |
| sort_order | int |
| metadata | jsonb |

### 9.3. `assessment_answers`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| question_id | uuid |
| answer_text | text |
| is_correct | boolean |
| sort_order | int |

### 9.4. `assessment_attempts`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| assessment_id | uuid |
| user_id | uuid |
| enrollment_id | uuid null |
| status | enum: in_progress / submitted / passed / failed |
| score_points | numeric(10,2) |
| score_percent | numeric(5,2) |
| started_at | timestamptz |
| submitted_at | timestamptz null |
| created_at | timestamptz |

### 9.5. `assessment_attempt_answers`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| attempt_id | uuid |
| question_id | uuid |
| selected_answer_ids | uuid[] null |
| text_answer | text null |
| is_correct | boolean null |
| points_awarded | numeric(8,2) |
| created_at | timestamptz |

---

## 10. Certificates

### 10.1. `certificate_templates`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| name | varchar |
| template_data | jsonb |
| status | enum: active / archived |
| created_at | timestamptz |
| updated_at | timestamptz |

В MVP можно начать с одного системного шаблона.

### 10.2. `certificates`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Сертификат |
| organization_id | uuid | Организация |
| user_id | uuid | Получатель |
| course_id | uuid | Курс |
| enrollment_id | uuid | Enrollment |
| certificate_template_id | uuid null | Шаблон |
| certificate_number | varchar | Уникальный номер |
| status | enum | issued / revoked |
| issued_at | timestamptz | Выдан |
| revoked_at | timestamptz null | Отозван |
| file_id | uuid null | PDF-файл сертификата |
| verification_code | varchar | Код проверки |
| metadata | jsonb | Доп. данные |

**Ограничения:**

```sql
unique (organization_id, certificate_number)
unique (verification_code)
```

---

## 11. Files & Media

### 11.1. `files`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Файл |
| organization_id | uuid | Организация |
| uploaded_by | uuid | Кто загрузил |
| bucket | varchar | Bucket |
| object_key | text | Ключ в S3 |
| original_filename | varchar | Оригинальное имя |
| mime_type | varchar | MIME |
| size_bytes | bigint | Размер |
| checksum | varchar null | Hash |
| visibility | enum | private / organization / public |
| status | enum | uploaded / processing / ready / failed / deleted |
| metadata | jsonb | Доп. данные |
| created_at | timestamptz | Создан |
| updated_at | timestamptz | Обновлён |
| deleted_at | timestamptz null | Soft delete |

### 11.2. `course_assets`

Связь файлов с курсами и уроками.

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| course_id | uuid |
| lesson_id | uuid null |
| file_id | uuid |
| asset_type | enum: cover / lesson_file / video / attachment / certificate_pdf |
| created_at | timestamptz |

---

## 12. Notifications

### 12.1. `notifications`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| user_id | uuid |
| type | varchar |
| title | varchar |
| body | text |
| status | enum: unread / read / archived |
| action_url | text null |
| metadata | jsonb |
| created_at | timestamptz |
| read_at | timestamptz null |

### 12.2. `notification_templates`

Можно добавить после MVP, если нужны email/push сценарии.

---

## 13. Reports & Analytics

В MVP отчёты можно строить запросами по основным таблицам. Отдельные aggregate tables можно добавить позже.

### 13.1. `report_snapshots` future scope

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid |
| report_type | varchar |
| filters | jsonb |
| data | jsonb |
| generated_by | uuid |
| generated_at | timestamptz |

---

## 14. Audit & System

### 14.1. `audit_logs`

| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | Событие аудита |
| organization_id | uuid null | Организация |
| actor_user_id | uuid null | Кто сделал действие |
| action | varchar | Действие |
| entity_type | varchar | Тип сущности |
| entity_id | uuid null | ID сущности |
| before | jsonb null | Состояние до |
| after | jsonb null | Состояние после |
| ip_address | inet null | IP |
| user_agent | text null | User agent |
| occurred_at | timestamptz | Когда |

Примеры `action`:

```text
user.created
course.published
assignment.created
role.assigned
certificate.revoked
```

### 14.2. `system_settings`

| Поле | Тип |
|---|---|
| id | uuid |
| organization_id | uuid null |
| key | varchar |
| value | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

---

## 15. Минимальный MVP-набор таблиц

Для первой рабочей версии достаточно реализовать:

```text
organizations
users
roles
user_roles
departments
groups
group_members
courses
course_modules
lessons
course_assignments
user_course_enrollments
lesson_progress
assessments
assessment_questions
assessment_answers
assessment_attempts
assessment_attempt_answers
certificates
files
course_assets
notifications
audit_logs
```

Таблицы, которые можно отложить:

```text
permissions
role_permissions
report_snapshots
notification_templates
course_prerequisites
certificate_templates расширенного уровня
advanced analytics aggregates
AI-related tables
SCORM/xAPI/LTI tables
```

---

## 16. Ключевые связи

```text
organization 1 → N users
organization 1 → N courses
organization 1 → N departments
organization 1 → N groups
user N → N roles через user_roles
user N → N groups через group_members
course 1 → N course_modules
course 1 → N lessons
course 1 → N course_assignments
course_assignment 1 → N user_course_enrollments
user_course_enrollment 1 → N lesson_progress
lesson/course 1 → N assessments
assessment 1 → N questions
question 1 → N answers
user/course/enrollment 1 → N assessment_attempts
user/course/enrollment 1 → 1 certificate
file N → N course_assets
```

---

## 17. Enum-справочники

Рекомендуемые enum-значения:

```text
user_status: active, invited, suspended, archived
course_status: draft, published, archived
lesson_status: draft, published, archived
enrollment_status: not_started, in_progress, completed, overdue, cancelled
lesson_progress_status: not_started, in_progress, completed
assignment_target_type: user, group, department, organization
assignment_status: active, cancelled, archived
assessment_status: draft, published, archived
attempt_status: in_progress, submitted, passed, failed
certificate_status: issued, revoked
file_status: uploaded, processing, ready, failed, deleted
notification_status: unread, read, archived
```

---

## 18. Рекомендации для ORM

Подходящие варианты:

1. **Prisma** — удобнее для AI coding agents и быстрого старта.
2. **Drizzle** — больше контроля над SQL и типами.

Для MVP рекомендуется **Prisma**, если приоритет — скорость разработки и понятность для AI-агентов. Если важен максимальный контроль SQL, можно выбрать Drizzle.

---

## 19. Правила для AI coding agent

AI-агент должен:

1. Не добавлять таблицы без связи с MVP или явно помечать их как future scope.
2. Не хранить файлы в PostgreSQL.
3. Не обходить `organization_id` в tenant-sensitive таблицах.
4. Не доверять frontend при проверке ролей и прав.
5. Не смешивать progress, attempts и certificates в одну таблицу.
6. Не добавлять AI/ML таблицы в MVP.
7. Не проектировать микросервисную БД на старте.
8. Любую миграцию сопровождать описанием причины.

---

## 20. Что проверить перед реализацией

Перед созданием миграций нужно подтвердить:

- выбран ORM: Prisma или Drizzle;
- нужен ли multi-tenant режим сразу или только organization-ready модель;
- какие типы уроков точно входят в MVP;
- нужен ли course builder в MVP или достаточно простого CRUD;
- нужны ли email-уведомления в MVP;
- нужен ли импорт пользователей CSV в MVP;
- нужно ли генерировать PDF-сертификат сразу или достаточно записи сертификата с последующей генерацией.

---

## 21. Итог

Эта модель данных достаточна для старта разработки LMS MVP. Она покрывает базовые корпоративные сценарии, но не перегружает проект enterprise-функциями. Структура совместима с modular monolith, PostgreSQL, TypeScript backend, React frontend, Railway deployment и будущим развитием в сторону mobile, integrations, analytics и AI-функций.
