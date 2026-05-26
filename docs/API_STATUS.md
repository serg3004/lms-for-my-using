# API Status

Last synced: 2026-05-26  
Source branch: `feature/pr-42-assessment-questions-api`

## Implemented

- Prisma models: `Organization`, `User`, `Membership`, `Group`, `Course`, `Lesson`, `CourseMaterial`, `Assignment`, `Progress`, `Assessment`, `AssessmentQuestion`, `AssessmentAnswerOption`.
- Auth API: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`.
- Reusable guards: `AuthGuard`, `RolesGuard`, `OrganizationScopeGuard`.

## Endpoint map

```text
GET  /api/v1/health

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users

GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships

GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups

GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses

GET  /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id
POST /api/v1/courses/:courseId/lessons

GET  /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
POST /api/v1/courses/:courseId/materials

GET  /api/v1/assignments
GET  /api/v1/assignments/:id
POST /api/v1/assignments

GET  /api/v1/progress
GET  /api/v1/progress/:id
POST /api/v1/progress

GET  /api/v1/assessments
GET  /api/v1/assessments/:id
POST /api/v1/assessments

GET  /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:id
POST /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:questionId/options
POST /api/v1/questions/:questionId/options
```

## RBAC

```text
organizations read: admin
users read: admin, manager
memberships read: admin, manager
memberships create: admin
groups read/create: admin, manager
courses read: admin, manager, instructor
courses create: admin, instructor
lessons read: admin, manager, instructor
lessons create: admin, instructor
course materials read: admin, manager, instructor
course materials create: admin, instructor
assignments read/create: admin, manager, instructor
progress read/create: admin, manager, instructor
assessments read: admin, manager, instructor
assessments create: admin, instructor
assessment questions read: admin, manager, instructor
assessment questions create: admin, instructor
assessment answer options read: admin, manager, instructor
assessment answer options create: admin, instructor
```

## Organization scope

```text
Read endpoints return current user organization data only.
Create endpoints with organizationId require organization match.
Assessment question create validates assessmentId.
Assessment answer option create validates questionId.
```

## Current limitations

- Public organization/user create remains until bootstrap/admin registration flow.
- Courses, Lessons, Course Materials, Assignments, Progress, Assessments, and Assessment Questions APIs are skeletons.
- Assessment attempts, automatic grading, certificates, OpenAPI, centralized API errors, and integration tests are not implemented yet.
