# API Status

Last synced: 2026-05-26  
Source branch: `feature/pr-44-assessment-attempts`

## Implemented

- Prisma baseline models through assessments, questions, answer options, assignments, progress, courses, lessons, materials, users, organizations, memberships, and groups.
- Assessment attempt tables are introduced by migration `20260526123000_add_assessment_attempts`.
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

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/attempts/:id
POST /api/v1/assessments/:assessmentId/attempts
```

## Organization scope

```text
Read endpoints return current user organization data only.
Create endpoints with organizationId require organization match.
Assessment attempts use currentUser.id and currentUser.organizationId.
Assessment attempt selected options must belong to their question.
```

## Current limitations

- Course completion gate for final assessment is not implemented yet.
- Assessment results / reports are not implemented yet.
- Certificates are not implemented yet.
- Users bulk import is not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
