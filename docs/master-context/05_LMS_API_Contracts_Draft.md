# 05. LMS API Contracts Draft

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать черновые API-контракты для backend, frontend, mobile future scope и AI coding agents.  
**Связь с Этапом 1 и 2:** API соответствует MVP roadmap, architecture map и database model draft.  
**Рекомендуемый стиль:** REST API first. OpenAPI можно сгенерировать на следующем этапе.

---

## 1. Общие принципы API

### 1.1. Базовый путь

```text
/api/v1
```

### 1.2. Формат данных

```http
Content-Type: application/json
Accept: application/json
```

### 1.3. Авторизация

Для MVP рекомендуется один из вариантов:

1. **Session cookie + CSRF protection** для web-first приложения.
2. **JWT access token + refresh token** для web + mobile future scope.

Практичный вариант для LMS с будущим mobile:

```text
JWT access token + refresh token
refresh token хранить безопасно
backend проверяет роли и organization scope
frontend не принимает security-решений самостоятельно
```

### 1.4. Ответ с ошибкой

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Некорректные данные запроса",
    "details": [
      {
        "field": "email",
        "message": "Email обязателен"
      }
    ]
  }
}
```

### 1.5. Пагинация

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 1.6. Фильтрация и сортировка

```text
GET /api/v1/courses?status=published&page=1&pageSize=20&sort=createdAt:desc
```

### 1.7. Общие HTTP-коды

| Код | Значение |
|---|---|
| 200 | Успешный запрос |
| 201 | Создано |
| 204 | Удалено/нет содержимого |
| 400 | Ошибка валидации |
| 401 | Не авторизован |
| 403 | Нет прав |
| 404 | Не найдено |
| 409 | Конфликт |
| 422 | Бизнес-ошибка |
| 500 | Внутренняя ошибка |

---

## 2. Auth API

### 2.1. Login

```http
POST /api/v1/auth/login
```

**Request:**

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

**Response:**

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "firstName": "Иван",
    "lastName": "Иванов",
    "roles": ["admin"],
    "organizationId": "uuid"
  }
}
```

### 2.2. Refresh token

```http
POST /api/v1/auth/refresh
```

### 2.3. Logout

```http
POST /api/v1/auth/logout
```

### 2.4. Current user

```http
GET /api/v1/auth/me
```

---

## 3. Organizations API

### 3.1. Get current organization

```http
GET /api/v1/organization
```

### 3.2. Update organization

```http
PATCH /api/v1/organization
```

**Roles:** owner/admin.

**Request:**

```json
{
  "name": "Acme Academy",
  "timezone": "Asia/Qyzylorda",
  "locale": "ru"
}
```

---

## 4. Users API

### 4.1. List users

```http
GET /api/v1/users?status=active&departmentId=uuid&page=1&pageSize=20
```

**Roles:** admin, manager.

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "learner@example.com",
      "firstName": "Анна",
      "lastName": "Петрова",
      "status": "active",
      "roles": ["learner"],
      "department": {
        "id": "uuid",
        "name": "Продажи"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 4.2. Get user

```http
GET /api/v1/users/{userId}
```

### 4.3. Create user

```http
POST /api/v1/users
```

**Request:**

```json
{
  "email": "learner@example.com",
  "firstName": "Анна",
  "lastName": "Петрова",
  "roles": ["learner"],
  "departmentId": "uuid",
  "sendInvite": true
}
```

### 4.4. Update user

```http
PATCH /api/v1/users/{userId}
```

### 4.5. Suspend user

```http
POST /api/v1/users/{userId}/suspend
```

### 4.6. Assign roles

```http
PUT /api/v1/users/{userId}/roles
```

**Request:**

```json
{
  "roles": ["learner", "manager"]
}
```

---

## 5. Departments API

### 5.1. List departments

```http
GET /api/v1/departments
```

### 5.2. Create department

```http
POST /api/v1/departments
```

**Request:**

```json
{
  "name": "Продажи",
  "parentId": null,
  "managerUserId": "uuid"
}
```

### 5.3. Update department

```http
PATCH /api/v1/departments/{departmentId}
```

### 5.4. Delete department

```http
DELETE /api/v1/departments/{departmentId}
```

---

## 6. Groups API

### 6.1. List groups

```http
GET /api/v1/groups
```

### 6.2. Create group

```http
POST /api/v1/groups
```

### 6.3. Add member

```http
POST /api/v1/groups/{groupId}/members
```

**Request:**

```json
{
  "userId": "uuid"
}
```

### 6.4. Remove member

```http
DELETE /api/v1/groups/{groupId}/members/{userId}
```

---

## 7. Courses API

### 7.1. List courses

```http
GET /api/v1/courses?status=published&page=1&pageSize=20
```

**Roles:**

- learner: только доступные/назначенные курсы;
- instructor/admin: курсы организации;
- manager: курсы, связанные с подчинёнными/группами.

### 7.2. Get course

```http
GET /api/v1/courses/{courseId}
```

### 7.3. Create course

```http
POST /api/v1/courses
```

**Roles:** instructor, admin.

**Request:**

```json
{
  "title": "Охрана труда для сотрудников",
  "description": "Базовый обязательный курс",
  "estimatedDurationMinutes": 90,
  "status": "draft"
}
```

### 7.4. Update course

```http
PATCH /api/v1/courses/{courseId}
```

### 7.5. Publish course

```http
POST /api/v1/courses/{courseId}/publish
```

### 7.6. Archive course

```http
POST /api/v1/courses/{courseId}/archive
```

---

## 8. Course Modules API

### 8.1. List modules

```http
GET /api/v1/courses/{courseId}/modules
```

### 8.2. Create module

```http
POST /api/v1/courses/{courseId}/modules
```

**Request:**

```json
{
  "title": "Модуль 1. Введение",
  "description": "Основные понятия",
  "sortOrder": 1
}
```

### 8.3. Update module

```http
PATCH /api/v1/courses/{courseId}/modules/{moduleId}
```

### 8.4. Reorder modules

```http
POST /api/v1/courses/{courseId}/modules/reorder
```

**Request:**

```json
{
  "items": [
    { "id": "uuid", "sortOrder": 1 },
    { "id": "uuid", "sortOrder": 2 }
  ]
}
```

---

## 9. Lessons API

### 9.1. List lessons

```http
GET /api/v1/courses/{courseId}/lessons
```

### 9.2. Create lesson

```http
POST /api/v1/courses/{courseId}/lessons
```

**Request:**

```json
{
  "moduleId": "uuid",
  "title": "Что такое безопасность труда",
  "type": "text",
  "content": {
    "blocks": [
      {
        "type": "paragraph",
        "text": "Текст урока..."
      }
    ]
  },
  "estimatedDurationMinutes": 10,
  "sortOrder": 1,
  "isRequired": true
}
```

### 9.3. Get lesson

```http
GET /api/v1/lessons/{lessonId}
```

### 9.4. Update lesson

```http
PATCH /api/v1/lessons/{lessonId}
```

### 9.5. Complete lesson

```http
POST /api/v1/lessons/{lessonId}/complete
```

**Roles:** learner.

**Response:**

```json
{
  "lessonProgress": {
    "lessonId": "uuid",
    "status": "completed",
    "completedAt": "2026-05-22T10:00:00.000Z"
  },
  "courseProgress": {
    "courseId": "uuid",
    "progressPercent": 42.86,
    "status": "in_progress"
  }
}
```

---

## 10. Assignments API

### 10.1. Create assignment

```http
POST /api/v1/course-assignments
```

**Roles:** admin, manager, instructor.

**Request:**

```json
{
  "courseId": "uuid",
  "targetType": "group",
  "targetGroupId": "uuid",
  "dueDate": "2026-06-30"
}
```

### 10.2. List assignments

```http
GET /api/v1/course-assignments?courseId=uuid&status=active
```

### 10.3. Cancel assignment

```http
POST /api/v1/course-assignments/{assignmentId}/cancel
```

### 10.4. List enrollments

```http
GET /api/v1/enrollments?userId=uuid&courseId=uuid&status=in_progress
```

### 10.5. My enrollments

```http
GET /api/v1/me/enrollments
```

---

## 11. Progress API

### 11.1. Get my course progress

```http
GET /api/v1/me/courses/{courseId}/progress
```

**Response:**

```json
{
  "courseId": "uuid",
  "status": "in_progress",
  "progressPercent": 60,
  "startedAt": "2026-05-20T10:00:00.000Z",
  "completedAt": null,
  "lessons": [
    {
      "lessonId": "uuid",
      "status": "completed",
      "progressPercent": 100
    }
  ]
}
```

### 11.2. Manager progress report

```http
GET /api/v1/reports/progress?groupId=uuid&courseId=uuid
```

---

## 12. Assessments API

### 12.1. Create assessment

```http
POST /api/v1/assessments
```

**Request:**

```json
{
  "courseId": "uuid",
  "lessonId": null,
  "title": "Итоговый тест",
  "passingScorePercent": 80,
  "maxAttempts": 3,
  "questions": [
    {
      "type": "single_choice",
      "questionText": "Какой вариант правильный?",
      "points": 1,
      "answers": [
        { "answerText": "Вариант A", "isCorrect": true },
        { "answerText": "Вариант B", "isCorrect": false }
      ]
    }
  ]
}
```

### 12.2. Get assessment for learner

```http
GET /api/v1/assessments/{assessmentId}
```

Для learner API не должен отдавать `isCorrect` до завершения попытки.

### 12.3. Start attempt

```http
POST /api/v1/assessments/{assessmentId}/attempts
```

### 12.4. Submit attempt

```http
POST /api/v1/assessment-attempts/{attemptId}/submit
```

**Request:**

```json
{
  "answers": [
    {
      "questionId": "uuid",
      "selectedAnswerIds": ["uuid"]
    }
  ]
}
```

**Response:**

```json
{
  "attemptId": "uuid",
  "status": "passed",
  "scorePercent": 85,
  "passed": true
}
```

---

## 13. Certificates API

### 13.1. List my certificates

```http
GET /api/v1/me/certificates
```

### 13.2. Get certificate

```http
GET /api/v1/certificates/{certificateId}
```

### 13.3. Issue certificate

Обычно вызывается backend-логикой при завершении курса.

```http
POST /api/v1/courses/{courseId}/issue-certificate
```

### 13.4. Verify certificate

```http
GET /api/v1/certificates/verify/{verificationCode}
```

**Public или semi-public endpoint.**

---

## 14. Files API

### 14.1. Request upload URL

```http
POST /api/v1/files/upload-url
```

**Request:**

```json
{
  "filename": "lesson.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "purpose": "lesson_file"
}
```

**Response:**

```json
{
  "fileId": "uuid",
  "uploadUrl": "https://s3-compatible-signed-url",
  "objectKey": "org/uuid/files/uuid.pdf"
}
```

### 14.2. Confirm upload

```http
POST /api/v1/files/{fileId}/confirm
```

### 14.3. Get file download URL

```http
GET /api/v1/files/{fileId}/download-url
```

---

## 15. Notifications API

### 15.1. List my notifications

```http
GET /api/v1/me/notifications?status=unread
```

### 15.2. Mark as read

```http
POST /api/v1/me/notifications/{notificationId}/read
```

### 15.3. Mark all as read

```http
POST /api/v1/me/notifications/read-all
```

---

## 16. Reports API

### 16.1. Admin dashboard summary

```http
GET /api/v1/reports/admin-summary
```

**Response:**

```json
{
  "usersTotal": 120,
  "activeUsers": 98,
  "coursesPublished": 12,
  "enrollmentsInProgress": 240,
  "enrollmentsCompleted": 180,
  "overdueEnrollments": 15
}
```

### 16.2. Course report

```http
GET /api/v1/reports/courses/{courseId}
```

### 16.3. User progress report

```http
GET /api/v1/reports/users/{userId}/progress
```

### 16.4. Export report future scope

```http
GET /api/v1/reports/progress/export?format=csv
```

Можно отложить после MVP.

---

## 17. Audit API

### 17.1. List audit logs

```http
GET /api/v1/audit-logs?entityType=course&actorUserId=uuid&page=1&pageSize=20
```

**Roles:** admin/owner.

---

## 18. Mobile future scope API

На старте API должен быть совместим с будущим мобильным приложением. Для этого полезны `me` endpoints:

```text
GET /api/v1/me
GET /api/v1/me/enrollments
GET /api/v1/me/courses/{courseId}/progress
GET /api/v1/me/certificates
GET /api/v1/me/notifications
```

В MVP мобильное приложение можно не реализовывать, но API не должен быть завязан только на web-admin сценарии.

---

## 19. RBAC по основным endpoint-ам

| Endpoint group | learner | instructor | manager | admin | owner |
|---|---:|---:|---:|---:|---:|
| `/me/*` | да | да | да | да | да |
| users read | нет | нет | частично | да | да |
| users write | нет | нет | нет | да | да |
| courses read | назначенные | свои/все | связанные | все | все |
| courses write | нет | да | нет/частично | да | да |
| assignments | нет | частично | да | да | да |
| reports | личные | по курсам | по команде | все | все |
| audit logs | нет | нет | нет | да | да |
| settings | нет | нет | нет | да | да |

---

## 20. Правила для AI coding agent

AI-агент должен:

1. Сначала реализовывать API по MVP learning loop.
2. Не создавать endpoint без RBAC-проверки.
3. Не отдавать learner-у правильные ответы теста до завершения попытки.
4. Не доверять `organizationId` из body, если он должен браться из текущего пользователя.
5. Использовать единый формат ошибок.
6. Использовать DTO/validation layer.
7. Писать тесты на critical endpoints.
8. Не смешивать admin API и learner `me` API.
9. Не добавлять AI endpoints в MVP.
10. Не добавлять SCORM/xAPI/LTI endpoints в MVP, если они не запланированы отдельной задачей.

---

## 21. Приоритет реализации API

### P0 — обязательно для MVP

```text
Auth
Users
Roles
Courses
Modules
Lessons
Assignments
Enrollments
Progress
Assessments
Certificates базово
Files upload/download
Admin summary report
```

### P1 — желательно

```text
Departments
Groups
Notifications
Audit logs
Course reports
Manager reports
```

### P2 — после MVP

```text
CSV import/export
Email templates
Advanced report exports
SCORM/xAPI/LTI
SSO
Integrations
AI recommendations
Mobile offline sync
```

---

## 22. Итог

Этот API draft достаточен для старта backend и frontend разработки. Он не является финальным OpenAPI-документом, но задаёт устойчивые границы endpoint-ов, ролей, payload-ов и MVP-приоритетов. Следующий шаг — превратить этот draft в OpenAPI schema или в backend routes с DTO и validation.
