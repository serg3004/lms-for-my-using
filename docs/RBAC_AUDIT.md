# RBAC Audit — Learner / Admin Access Control

Аудит проведён: 2026-07-08.
Ветка: `claude/pr-71-rbac-audit`.

---

## Инфраструктура (что есть)

| Слой | Механизм |
|------|----------|
| Auth | `AuthGuard` — JWT из cookie, ставит `request.currentUser` |
| Roles | `RolesGuard` + `@Roles()` декоратор — проверяет `rolePolicies` |
| Org scope | `OrganizationScopeGuard` + `@OrganizationScope()` — `body.organizationId` должен совпадать с `currentUser.organizationId` |
| User scope | `isLearnerOnly(roles)` — хелпер, определяет нужен ли userId-фильтр |
| Frontend | `ProtectedRoute` с `canAccess` + `isAdminNavigationRole` — route-level guard |

---

## Матрица endpoints

### Auth

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `POST /auth/login` | public | — | — | ✅ |
| `GET /auth/me` | authenticated | — | currentUser | ✅ |
| `POST /auth/logout` | authenticated | — | — | ✅ |
| `POST /auth/password-reset/request` | public | — | — | ✅ disabled (ServiceUnavailableException) |
| `POST /auth/password-reset/confirm` | public | — | — | ✅ disabled (ServiceUnavailableException) |

### Organizations

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /organizations/:id` | admin | — | — | ✅ |

### Users

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /users` | admin, manager | currentUser.orgId | — | ✅ |
| `GET /users/:id` | admin, manager | currentUser.orgId | — | ✅ |
| `POST /users` | admin, manager | body.orgId === currentUser.orgId | — | ✅ |
| `PATCH /users/:id` | admin, manager | currentUser.orgId | — | ✅ |
| `PATCH /users/:id/status` | admin, manager | currentUser.orgId | — | ✅ |

### Courses

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /courses` | all | currentUser.orgId | — | ✅ все роли видят курсы (норма) |
| `GET /courses/:id` | all | currentUser.orgId | — | ✅ |
| `GET /courses/:id/completion` | all | currentUser.orgId | currentUser.id | ✅ |
| `POST /courses` | admin, instructor | body.orgId check | — | ✅ |
| `PATCH /courses/:id` | admin, instructor | currentUser.orgId | — | ✅ |
| `DELETE /courses/:id` | admin, instructor | currentUser.orgId | — | ✅ |

### Lessons

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /courses/:id/lessons` | all | currentUser.orgId | — | ✅ |
| `GET /lessons/:id` | all | currentUser.orgId | — | ✅ |
| `POST /courses/:id/lessons` | admin, instructor | body.orgId check | — | ✅ |
| `PATCH /lessons/:id` | admin, instructor | currentUser.orgId | — | ✅ |
| `DELETE /lessons/:id` | admin, instructor | currentUser.orgId | — | ✅ |

### Progress

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /progress` | all | currentUser.orgId | learner → currentUser.id | ✅ **ИСПРАВЛЕНО** |
| `GET /progress/:id` | all | currentUser.orgId | learner → currentUser.id | ✅ **ИСПРАВЛЕНО** |
| `POST /progress` | all | body.orgId check | learner → userId принудительно = currentUser.id | ✅ **ИСПРАВЛЕНО** |

**Было:** `listProgress(orgId)` — learner видел прогресс всей организации.
**Стало:** `listProgress(orgId, userId?)` — для learner-only роли передаётся `userId = currentUser.id`.

### Assignments

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /assignments` | all | currentUser.orgId | learner → currentUser.id (прямые) | ✅ **ИСПРАВЛЕНО** |
| `GET /assignments/:id` | all | currentUser.orgId | — | ⚠️ org-scope only |
| `POST /assignments` | admin, manager, instructor | body.orgId check | — | ✅ learner не может создавать |
| `PATCH /assignments/:id/status` | admin, manager, instructor | currentUser.orgId | — | ✅ |

**Было:** `listAssignments(orgId)` — learner видел все назначения организации.
**Стало:** `listAssignments(orgId, userId?)` — для learner-only роли передаётся `userId = currentUser.id`.

> ⚠️ `GET /assignments/:id` — фильтр по userId не добавлен. Группновые назначения (`groupId`) не имеют прямой связи с userId learner-а, что делает фильтр по userId некорректным для группных назначений. Риск минимален: UUID не угадывается, а learner знает только те ID, которые получает из `GET /assignments` (уже защищённого). Follow-up: PR 71a — правильный ownership через группы.

### Assessments

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /assessments` | all | currentUser.orgId | — | ✅ все роли видят тесты (норма) |
| `GET /assessments/:id` | all | currentUser.orgId | — | ✅ |
| `POST /assessments` | admin, instructor | body.orgId check | — | ✅ |
| `PATCH /assessments/:id` | admin, instructor | currentUser.orgId | — | ✅ |

### Assessment Attempts

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /assessments/:id/attempts` | admin, manager, instructor | currentUser.orgId | — | ✅ learner не имеет доступа |
| `GET /assessments/:id/results` | admin, manager, instructor | currentUser.orgId | — | ✅ |
| `GET /assessments/:id/report` | admin, manager, instructor | currentUser.orgId | — | ✅ |
| `GET /attempts/:id` | admin, manager, instructor | currentUser.orgId | — | ✅ learner не имеет доступа |
| `GET /attempts/:id/result` | all | currentUser.orgId | currentUser.id | ✅ |
| `POST /assessments/:id/attempts` | all | currentUser.orgId | currentUser.id | ✅ |

### Certificates

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `GET /certificates` | all | currentUser.orgId | currentUser.id | ✅ |
| `GET /certificates/:id` | all | currentUser.orgId | currentUser.id | ✅ |
| `POST /certificates` | admin, manager, instructor | body.orgId check | — | ✅ |

### Upload

| Endpoint | Роли | Org-scope | User-scope | Статус |
|----------|------|-----------|------------|--------|
| `POST /upload` | admin, instructor | — | — | ✅ |

---

## Frontend audit

Фронтенд не является местом enforcement — backend является единственным gate. Тем не менее:

| Страница | API calls | Роль | Статус |
|----------|-----------|------|--------|
| `LearnerProgressPage` | `listProgress()` | learner | ✅ backend теперь фильтрует по userId |
| `LearnerLessonsPage` | `listProgress()` | learner | ✅ |
| `LearnerCourseDetailPage` | `listProgress()` | learner | ✅ |
| `LearnerLessonDetailPage` | `markLessonCompleted({ userId: currentUser.id })` | learner | ✅ передаёт свой userId |
| `LearnerAssignmentsPage` | `listAssignments()` | learner | ✅ backend теперь фильтрует по userId |
| `AdminAssignmentCompletionPage` | `apiRequest('/progress')` | admin | ✅ admin-роль → без фильтра, видит всё |

---

## Что осталось (follow-up)

| ID | Задача | Приоритет |
|----|--------|-----------|
| PR 71a | `GET /assignments/:id` — ownership через группы (membership check) | низкий |
| PR 71b | Групповые назначения в `listAssignments` для learner (через membership join) | средний |
| PR 71c | Audit assessment questions / answer options для instructor ownership | низкий |
