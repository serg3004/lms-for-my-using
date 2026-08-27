# 14. LMS Testing Strategy

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** определить стратегию тестирования MVP и дальнейших версий LMS.  
**Целевая модель разработки:** один разработчик + AI-агенты + private GitHub + Pull Request workflow.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, Railway-first, Docker-portable.

---

## 1. Цель тестирования

Тестирование должно подтвердить, что основной learning loop работает стабильно:

```text
пользователь создан → роль назначена → курс создан → курс назначен → урок пройден → тест сдан → сертификат выдан → отчёт обновлён
```

Для MVP не нужна чрезмерная enterprise test-suite, но нужны тесты, которые защищают ключевые сценарии и не дают AI-агентам ломать уже реализованную функциональность.

---

## 2. Принципы тестирования

1. **Сначала критические сценарии, потом покрытие ради покрытия.**
2. **Каждый backend-модуль должен иметь минимум unit/integration tests.**
3. **Каждый role-sensitive endpoint должен иметь forbidden tests.**
4. **E2E тесты покрывают только главные пользовательские маршруты MVP.**
5. **AI-агент не должен закрывать задачу без тестов или объяснения, почему тесты не нужны.**
6. **Тесты должны быть понятными, стабильными и воспроизводимыми локально.**
7. **Smoke tests обязательны перед деплоем.**

---

## 3. Уровни тестирования

```text
Static checks
Unit tests
Integration tests
API tests
Frontend component tests
E2E tests
Security/RBAC tests
Smoke tests
Deployment checks
Manual pilot checklist
```

---

## 4. Static checks

### 4.1 Что проверять

- TypeScript compile;
- lint;
- formatting;
- dependency consistency;
- отсутствие hardcoded secrets;
- корректность env example;
- отсутствие прямого commit `.env`.

### 4.2 Рекомендуемые команды

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

### 4.3 CI minimum

В GitHub Actions для каждого PR:

```text
install dependencies
typecheck
lint
unit tests
build api
build web
```

---

## 5. Backend Unit Tests

### 5.1 Что покрывать

- domain services;
- validators;
- permission helpers;
- progress calculation;
- assessment scoring;
- certificate eligibility;
- date/status transitions;
- utility functions.

### 5.2 Примеры unit cases

```text
Learner cannot access another user's progress
Manager can view assigned department report
Assessment score calculated by backend
Certificate is generated only after required completion
Course cannot be published without lessons
Assignment status changes when all required lessons are completed
```

### 5.3 Не тестировать unit-тестами

- ORM internals;
- framework internals;
- визуальный layout;
- сторонние библиотеки.

---

## 6. Backend Integration Tests

### 6.1 Что покрывать

Integration tests должны проверять backend + database + module interactions.

Обязательные модули:

```text
Auth
Users/Roles
Organizations/Groups
Courses/Lessons
Assignments
Progress
Assessments
Certificates
Reports
Files metadata
Audit log
```

### 6.2 Подход к БД

Рекомендуется использовать отдельную test database:

```text
DATABASE_URL_TEST
migrations before tests
seed minimal fixtures
cleanup after test suite or transaction rollback
```

### 6.3 Минимальный набор integration tests

- [ ] создать пользователя;
- [ ] назначить роль;
- [ ] создать организацию;
- [ ] создать курс;
- [ ] добавить урок;
- [ ] опубликовать курс;
- [ ] назначить курс learner;
- [ ] обновить прогресс;
- [ ] пройти тест;
- [ ] получить сертификат;
- [ ] увидеть отчёт;
- [ ] проверить audit log admin action.

---

## 7. API Tests

### 7.1 Для каждого endpoint

Проверять:

- успешный сценарий;
- validation error;
- unauthenticated access;
- forbidden role;
- wrong organization scope;
- not found;
- pagination для list endpoint;
- audit log для sensitive actions.

### 7.2 Auth API

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

Тесты:

- correct credentials login;
- wrong password returns safe error;
- inactive user cannot login;
- refresh token works;
- logout invalidates session/token;
- `/me` returns user role and organization context.

### 7.3 Courses API

Тесты:

- Admin/Instructor can create course;
- Learner cannot create course;
- draft course not visible to Learner;
- published assigned course visible to Learner;
- course from another organization forbidden.

### 7.4 Progress API

Тесты:

- Learner can update own assigned lesson progress;
- Learner cannot update another user progress;
- progress cannot be updated for unassigned course;
- completion updates assignment status when rules satisfied.

### 7.5 Assessment API

Тесты:

- Learner can start attempt if course assigned;
- backend calculates score;
- correct answers are not exposed before completion;
- attempt limit is enforced;
- passed attempt can trigger certificate eligibility.

---

## 8. RBAC Test Matrix

| Действие | Learner | Instructor | Manager | Admin | Owner |
|---|---:|---:|---:|---:|---:|
| Смотреть свои курсы | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создать курс | ❌ | ✅ | ❌/limited | ✅ | ✅ |
| Опубликовать курс | ❌ | ✅/limited | ❌ | ✅ | ✅ |
| Назначить курс | ❌ | ❌/limited | ✅/limited | ✅ | ✅ |
| Смотреть отчёт группы | ❌ | ❌/limited | ✅ | ✅ | ✅ |
| Управлять ролями | ❌ | ❌ | ❌ | ✅/limited | ✅ |
| Настройки организации | ❌ | ❌ | ❌ | ✅/limited | ✅ |
| Выдать/отозвать сертификат | ❌ | ❌/limited | ❌ | ✅ | ✅ |

Каждая строка должна иметь backend/API tests.

---

## 9. Frontend Testing

### 9.1 Что покрывать

- auth forms;
- protected routes;
- role-based navigation;
- course list;
- course editor basic flow;
- learner course player;
- assessment UI;
- certificate screen;
- reports filters;
- API error display.

### 9.2 Component tests

Проверять:

```text
компонент рендерит состояние loading/error/empty/success
кнопки скрываются для запрещённых ролей
формы валидируются до отправки
ошибки backend отображаются безопасно
```

### 9.3 Не перегружать MVP

В MVP достаточно покрыть критичные UI-компоненты. Полное визуальное regression testing можно отложить.

---

## 10. E2E Tests

### 10.1 Инструмент

Рекомендуется Playwright.

### 10.2 MVP E2E сценарии

#### E2E-01 Admin creates learner and course

```text
Admin login
Create learner
Create course
Add lesson
Publish course
Assign course to learner
Logout
```

#### E2E-02 Learner completes course

```text
Learner login
Open assigned course
Open lesson
Mark lesson complete
Start assessment
Submit answers
See result
See certificate if passed
```

#### E2E-03 Manager views report

```text
Manager login
Open dashboard
Filter assigned team/group
See learner progress
Open course completion report
```

#### E2E-04 RBAC protection

```text
Learner tries to open admin users page
Learner receives forbidden/redirect
Backend API also returns 403
```

---

## 11. Security Tests

Минимальные security tests:

- [ ] unauthenticated request returns 401;
- [ ] forbidden role returns 403;
- [ ] wrong organization resource returns 403/404;
- [ ] login rate limiting works;
- [ ] correct answers not exposed before assessment completion;
- [ ] file download requires permission;
- [ ] admin action writes audit log;
- [ ] `.env` не попадает в build artifact;
- [ ] error response не содержит stack trace in production mode.

---

## 12. File Upload Tests

Проверить:

- разрешённый тип файла загружается;
- запрещённый тип отклоняется;
- слишком большой файл отклоняется;
- file metadata создаётся в БД;
- file object key не предсказуемый;
- Learner не может скачать файл чужого курса;
- pre-signed URL имеет короткий TTL, если используется.

---

## 13. Reports Tests

Проверить:

- Admin видит organization-level отчёты;
- Manager видит только свою группу/департамент;
- Learner не имеет доступа к чужим отчётам;
- course completion считается корректно;
- assessment pass/fail считается корректно;
- certificate issued status отображается корректно.

---

## 14. Certificate Tests

Проверить:

- сертификат не выдаётся до выполнения правил;
- сертификат выдаётся после успешного completion/pass;
- certificate number уникален;
- certificate verification endpoint не раскрывает лишние данные;
- отзыв сертификата пишет audit log.

---

## 15. Notification Tests

Для MVP:

- [ ] уведомление создаётся при назначении курса;
- [ ] learner видит свои уведомления;
- [ ] learner не видит чужие уведомления;
- [ ] email отправка mock/stub в тестах;
- [ ] failed email не ломает основную транзакцию назначения.

---

## 16. Migration Tests

Перед merge:

- [ ] миграция применяется на чистую БД;
- [ ] миграция применяется на существующую dev БД;
- [ ] rollback strategy описана, если инструмент поддерживает;
- [ ] seed script не создаёт production admin с публичным паролем;
- [ ] индексы добавлены для новых frequent queries.

---

## 17. Smoke Tests перед деплоем

Минимальный smoke checklist:

```text
web app opens
api healthcheck works
database connection works
login works
admin dashboard opens
course list opens
learner assigned course opens
progress update works
reports page opens
file storage health works if configured
```

---

## 18. Railway Deployment Checks

После деплоя:

- [ ] healthcheck зелёный;
- [ ] миграции применены;
- [ ] frontend может обращаться к backend;
- [ ] CORS/env настроены;
- [ ] login работает;
- [ ] upload/download работает;
- [ ] logs не содержат секреты;
- [ ] production error не показывает stack trace.

---

## 19. Manual Pilot Testing

Перед первым пользователем вручную пройти:

1. Создать организацию.
2. Создать Admin.
3. Создать Learner.
4. Создать Manager.
5. Создать курс.
6. Добавить 2–3 урока.
7. Добавить тест.
8. Опубликовать курс.
9. Назначить курс learner.
10. Пройти курс learner-ом.
11. Пройти тест.
12. Получить сертификат.
13. Проверить отчёт Manager/Admin.
14. Проверить audit log.
15. Проверить logout/login.

---

## 20. AI Agent Testing Rules

AI coding agent обязан в каждом PR указать:

```text
Какие тесты добавлены
Какие тесты обновлены
Какие тесты запускались
Какие сценарии не покрыты и почему
Какие риски остались
```

Запрещено:

- закрывать issue без тестов для backend/API изменения;
- удалять failing tests без объяснения;
- отключать RBAC tests;
- мокать всю бизнес-логику в integration tests;
- менять тестовую стратегию без отдельной задачи.

---

## 21. Рекомендуемые тестовые команды

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm build
```

Для backend отдельно:

```bash
pnpm --filter api test
pnpm --filter api test:integration
```

Для frontend отдельно:

```bash
pnpm --filter web test
pnpm --filter web test:e2e
pnpm --filter web build
```

---

## 22. Coverage expectations

Для MVP ориентиры:

| Зона | Минимум |
|---|---:|
| Backend domain services | 70%+ для критичных модулей |
| Auth/RBAC | высокий приоритет, покрыть основные матрицы |
| API integration | все core endpoints |
| Frontend components | только критичные экраны |
| E2E | 3–5 главных сценариев |
| Security tests | все P0/P1 сценарии |

Coverage не должен быть самоцелью. Важнее — покрытие критических пользовательских и security-сценариев.

---

## 23. Test Data Strategy

Минимальные seed fixtures:

```text
1 organization
1 owner/admin
1 instructor
1 manager
2 learners
1 department
1 group
1 draft course
1 published course
1 assignment
1 assessment
```

Тестовые данные должны быть воспроизводимыми и не зависеть от production secrets.

---

## 24. Definition of Done для тестирования

Задача считается готовой, если:

- тесты добавлены или обоснованно не нужны;
- все существующие тесты проходят;
- role/permission сценарии проверены;
- migration проверена, если менялась БД;
- smoke-сценарий не сломан;
- PR содержит список запущенных проверок.

