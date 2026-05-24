# 08. LMS GitHub Issues Import

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** подготовить задачи для переноса в GitHub Issues.  
**Формат:** Markdown-список issues с title, labels, milestone, priority, description, acceptance criteria и dependencies.  
**Целевая модель:** задачи должны быть достаточно конкретными для AI coding agent.

---

## 1. Labels

Рекомендуемые GitHub labels:

```text
type:backend
type:frontend
type:database
type:devops
type:security
type:testing
type:docs
type:ai-agent
area:auth
area:users
area:org
area:courses
area:assignments
area:progress
area:assessments
area:certificates
area:files
area:reports
area:notifications
area:audit
area:deployment
priority:P0
priority:P1
priority:P2
priority:P3
status:ready
status:blocked
status:needs-review
```

---

## 2. Milestones

```text
M0 Repository & Infrastructure
M1 Identity & Access
M2 Organization Structure
M3 Course Management
M4 Learning Delivery
M5 Assessments & Certificates
M6 Reports & Notifications
M7 Deployment & Pilot Readiness
M8 Future Product Growth
```

---

# M0 — Repository & Infrastructure

## Issue 001 — Create private monorepo structure

**Labels:** `type:devops`, `type:docs`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Create the initial private GitHub monorepo structure for the LMS platform.

### Tasks

- Create root structure: `apps`, `packages`, `infra`, `docs`, `scripts`, `.github`.
- Add root `README.md`.
- Add `.gitignore`.
- Add initial docs folders.

### Acceptance Criteria

- Repository has the approved monorepo structure.
- README explains project purpose and local development entry points.
- No secrets are committed.

### Dependencies

None.

---

## Issue 002 — Configure pnpm workspace and root scripts

**Labels:** `type:devops`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Configure the package manager and root scripts for backend, frontend and shared packages.

### Tasks

- Add `pnpm-workspace.yaml`.
- Add root `package.json`.
- Add scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`.
- Add shared TypeScript config package if needed.

### Acceptance Criteria

- `pnpm install` works.
- Workspace detects `apps/api`, `apps/web`, `packages/shared`.
- Root scripts execute without missing package errors.

### Dependencies

Issue 001.

---

## Issue 003 — Bootstrap API application

**Labels:** `type:backend`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Create the backend TypeScript app with a basic health endpoint and modular folder structure.

### Tasks

- Create `apps/api`.
- Configure TypeScript.
- Add HTTP server.
- Add `GET /health`.
- Add module folders: auth, users, organizations, courses, assignments, progress, assessments, certificates, files, reports, notifications, audit.

### Acceptance Criteria

- API starts locally.
- `GET /health` returns a valid success response.
- Project compiles with TypeScript.

### Dependencies

Issue 002.

---

## Issue 004 — Bootstrap web application

**Labels:** `type:frontend`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Create the React + TypeScript web app for LMS admin, manager, instructor and learner interfaces.

### Tasks

- Create `apps/web`.
- Configure React + TypeScript.
- Add routing.
- Add pages: login, dashboard placeholder, not found.
- Add API client placeholder.

### Acceptance Criteria

- Web app starts locally.
- Login page renders.
- Dashboard placeholder renders after mocked auth state.

### Dependencies

Issue 002.

---

## Issue 005 — Configure PostgreSQL and migration tool

**Labels:** `type:database`, `type:backend`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Connect API to PostgreSQL and configure the selected ORM/migration tool.

### Tasks

- Add database dependency.
- Choose and configure Prisma or Drizzle.
- Add database connection service.
- Add `.env.example`.
- Add initial migration.

### Acceptance Criteria

- API connects to local PostgreSQL.
- Migration command runs successfully.
- `.env.example` includes required variables without secrets.

### Dependencies

Issue 003.

---

## Issue 006 — Add Docker local development setup

**Labels:** `type:devops`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Add Docker support for local development and future portability.

### Tasks

- Add `docker-compose.yml` with PostgreSQL.
- Add API Dockerfile.
- Add web Dockerfile or deployment notes.
- Add local Docker documentation.

### Acceptance Criteria

- PostgreSQL starts with Docker Compose.
- API can connect to Docker PostgreSQL.
- README includes local Docker startup steps.

### Dependencies

Issue 005.

---

## Issue 007 — Add basic GitHub Actions CI

**Labels:** `type:devops`, `type:testing`, `priority:P0`, `status:ready`  
**Milestone:** M0 Repository & Infrastructure

### Description

Add CI checks for pull requests.

### Tasks

- Add workflow for install, lint, typecheck, tests.
- Configure caching.
- Ensure PRs fail on errors.

### Acceptance Criteria

- CI runs on pull request.
- CI fails on TypeScript errors.
- CI fails on lint errors.

### Dependencies

Issue 002.

---

# M1 — Identity & Access

## Issue 008 — Implement users database model

**Labels:** `type:database`, `type:backend`, `area:users`, `priority:P0`, `status:ready`  
**Milestone:** M1 Identity & Access

### Description

Implement the database model for LMS users.

### Tasks

- Add `users` table.
- Add fields: id, organization_id, email, password_hash, first_name, last_name, status, created_at, updated_at.
- Add unique email constraint.
- Add indexes for organization and status.

### Acceptance Criteria

- User migration applies successfully.
- Email is unique.
- Password is never stored as plain text.

### Dependencies

Issue 005.

---

## Issue 009 — Implement roles and user_roles model

**Labels:** `type:database`, `type:backend`, `area:auth`, `priority:P0`, `status:ready`  
**Milestone:** M1 Identity & Access

### Description

Create RBAC data model.

### Tasks

- Add `roles` table.
- Add `user_roles` table.
- Seed roles: learner, instructor, manager, admin.
- Add helper for role checks.

### Acceptance Criteria

- Roles are seeded.
- A user can have assigned roles.
- API can query user roles.

### Dependencies

Issue 008.

---

## Issue 010 — Implement auth endpoints

**Labels:** `type:backend`, `area:auth`, `priority:P0`, `status:ready`  
**Milestone:** M1 Identity & Access

### Description

Implement login, logout and current user endpoints.

### Tasks

- Add `POST /auth/login`.
- Add `POST /auth/logout`.
- Add `GET /auth/me`.
- Add password verification.
- Add JWT/session handling.

### Acceptance Criteria

- Valid user can log in.
- Invalid password is rejected.
- `GET /auth/me` returns current authenticated user.
- Protected endpoints reject unauthenticated requests.

### Dependencies

Issue 008, Issue 009.

---

## Issue 011 — Implement RBAC middleware

**Labels:** `type:backend`, `type:security`, `area:auth`, `priority:P0`, `status:ready`  
**Milestone:** M1 Identity & Access

### Description

Add reusable authorization middleware for role-based access control.

### Tasks

- Add `requireAuth` middleware.
- Add `requireRole` middleware.
- Add permission helpers.
- Cover admin/instructor/manager/learner role checks.

### Acceptance Criteria

- Protected routes require auth.
- Admin-only endpoints are not accessible to learners.
- Tests or manual checks cover role denial.

### Dependencies

Issue 010.

---

## Issue 012 — Implement login/logout UI

**Labels:** `type:frontend`, `area:auth`, `priority:P0`, `status:ready`  
**Milestone:** M1 Identity & Access

### Description

Build the authentication UI flow.

### Tasks

- Add login form.
- Connect to auth API.
- Store auth state safely.
- Add logout action.
- Add protected route wrapper.

### Acceptance Criteria

- User can log in from UI.
- Login errors are displayed.
- Logout removes session state.
- Protected routes redirect unauthenticated users.

### Dependencies

Issue 010.

---

# M2 — Organization Structure

## Issue 013 — Implement organizations model and API

**Labels:** `type:backend`, `type:database`, `area:org`, `priority:P0`, `status:ready`  
**Milestone:** M2 Organization Structure

### Description

Implement the organization model required for corporate LMS structure.

### Tasks

- Add `organizations` table.
- Link users and courses to organization.
- Add basic organization read/update endpoints for admin.

### Acceptance Criteria

- Organization can be created/seeded.
- Users belong to an organization.
- Organization boundary can be used in queries.

### Dependencies

Issue 008.

---

## Issue 014 — Implement departments and groups

**Labels:** `type:backend`, `type:database`, `area:org`, `priority:P1`, `status:ready`  
**Milestone:** M2 Organization Structure

### Description

Implement departments, groups and group membership.

### Tasks

- Add `departments` table.
- Add `groups` table.
- Add `group_members` table.
- Add CRUD endpoints for admin/manager.

### Acceptance Criteria

- Admin can create departments.
- Admin/Manager can create groups.
- Users can be added to groups.

### Dependencies

Issue 013.

---

## Issue 015 — Build organization management UI

**Labels:** `type:frontend`, `area:org`, `priority:P1`, `status:ready`  
**Milestone:** M2 Organization Structure

### Description

Create UI screens for departments and groups.

### Tasks

- Groups list.
- Create/edit group form.
- Add/remove group members.
- Departments list.

### Acceptance Criteria

- Admin/Manager can manage groups through UI.
- Group members are visible.

### Dependencies

Issue 014.

---

# M3 — Course Management

## Issue 016 — Implement courses model and API

**Labels:** `type:backend`, `type:database`, `area:courses`, `priority:P0`, `status:ready`  
**Milestone:** M3 Course Management

### Description

Implement core course CRUD.

### Tasks

- Add `courses` table.
- Add status: draft, published, archived.
- Add endpoints: list, create, read, update, archive.
- Add RBAC rules for admin/instructor.

### Acceptance Criteria

- Admin/Instructor can create courses.
- Learner cannot create courses.
- Archived courses are not assignable.

### Dependencies

Issue 011, Issue 013.

---

## Issue 017 — Implement course modules and lessons

**Labels:** `type:backend`, `type:database`, `area:courses`, `priority:P0`, `status:ready`  
**Milestone:** M3 Course Management

### Description

Implement lesson structure inside courses.

### Tasks

- Add `course_modules` table.
- Add `lessons` table.
- Add lesson ordering.
- Add lesson types: text, video_url, file, quiz_reference.
- Add CRUD endpoints.

### Acceptance Criteria

- A course can contain ordered modules and lessons.
- Lesson order is preserved.
- Empty course cannot be published.

### Dependencies

Issue 016.

---

## Issue 018 — Build Course Builder MVP UI

**Labels:** `type:frontend`, `area:courses`, `priority:P0`, `status:ready`  
**Milestone:** M3 Course Management

### Description

Build MVP UI for course creation and editing.

### Tasks

- Course list.
- Course create/edit screen.
- Lesson editor.
- Publish action.

### Acceptance Criteria

- Instructor can create a course from UI.
- Instructor can add lessons.
- Instructor can publish course after minimum validation.

### Dependencies

Issue 016, Issue 017.

---

## Issue 019 — Implement file upload metadata and storage interface

**Labels:** `type:backend`, `type:database`, `area:files`, `priority:P1`, `status:ready`  
**Milestone:** M3 Course Management

### Description

Add S3-compatible file storage integration for course materials.

### Tasks

- Add `files` table.
- Add storage service abstraction.
- Add upload endpoint or presigned URL endpoint.
- Validate file type and size.

### Acceptance Criteria

- File metadata is saved in database.
- File upload rejects unsupported MIME types.
- Files can be linked to lessons.

### Dependencies

Issue 017.

---

# M4 — Learning Delivery

## Issue 020 — Implement assignments model and API

**Labels:** `type:backend`, `type:database`, `area:assignments`, `priority:P0`, `status:ready`  
**Milestone:** M4 Learning Delivery

### Description

Implement course assignments for users and groups.

### Tasks

- Add `assignments` table.
- Support assignment to user and group.
- Add due date.
- Add endpoints for create/list/read/update.

### Acceptance Criteria

- Manager/Admin can assign published course to user.
- Manager/Admin can assign published course to group.
- Learner can see own assignments.

### Dependencies

Issue 014, Issue 016.

---

## Issue 021 — Build assignment management UI

**Labels:** `type:frontend`, `area:assignments`, `priority:P0`, `status:ready`  
**Milestone:** M4 Learning Delivery

### Description

Build UI for assigning courses.

### Tasks

- Select course.
- Select user or group.
- Set due date.
- Show assignment list.

### Acceptance Criteria

- Manager/Admin can assign a course through UI.
- Assigned learner sees course on learner dashboard.

### Dependencies

Issue 020.

---

## Issue 022 — Build learner dashboard

**Labels:** `type:frontend`, `area:assignments`, `priority:P0`, `status:ready`  
**Milestone:** M4 Learning Delivery

### Description

Build learner dashboard with assigned courses.

### Tasks

- Show assigned courses.
- Show status and due date.
- Add link to course player.

### Acceptance Criteria

- Learner sees only own assigned courses.
- Status is visible.
- Overdue state is visible.

### Dependencies

Issue 020.

---

## Issue 023 — Implement progress tracking

**Labels:** `type:backend`, `type:database`, `area:progress`, `priority:P0`, `status:ready`  
**Milestone:** M4 Learning Delivery

### Description

Implement course and lesson progress tracking.

### Tasks

- Add `course_progress` table.
- Add `lesson_progress` table.
- Add endpoint to mark lesson complete.
- Add progress calculation.

### Acceptance Criteria

- Learner can mark a lesson complete.
- Course progress percent updates.
- Course becomes complete when rules are satisfied.

### Dependencies

Issue 017, Issue 020.

---

## Issue 024 — Build learner course player MVP

**Labels:** `type:frontend`, `area:progress`, `area:courses`, `priority:P0`, `status:ready`  
**Milestone:** M4 Learning Delivery

### Description

Build the course player for learners.

### Tasks

- Show course title and lessons.
- Render text/video/file lesson types.
- Add mark-complete action.
- Show progress.

### Acceptance Criteria

- Learner can open assigned course.
- Learner can complete lessons.
- UI reflects progress.

### Dependencies

Issue 022, Issue 023.

---

# M5 — Assessments & Certificates

## Issue 025 — Implement assessments and questions model

**Labels:** `type:backend`, `type:database`, `area:assessments`, `priority:P1`, `status:ready`  
**Milestone:** M5 Assessments & Certificates

### Description

Implement quiz and question model.

### Tasks

- Add `assessments` table.
- Add `questions` table.
- Add `answers` table.
- Support single_choice and multiple_choice.
- Add CRUD endpoints for instructors.

### Acceptance Criteria

- Instructor can create quiz.
- Quiz can be linked to lesson or course.
- Correct answers are not exposed to learner before submission.

### Dependencies

Issue 017.

---

## Issue 026 — Implement assessment attempts and scoring

**Labels:** `type:backend`, `area:assessments`, `priority:P1`, `status:ready`  
**Milestone:** M5 Assessments & Certificates

### Description

Allow learners to submit quiz attempts and receive results.

### Tasks

- Add `assessment_attempts` table.
- Add `assessment_attempt_answers` table.
- Add submit endpoint.
- Add scoring and pass threshold.

### Acceptance Criteria

- Learner can submit answers.
- Score is calculated correctly.
- Pass/fail result is stored.

### Dependencies

Issue 025.

---

## Issue 027 — Build assessment UI

**Labels:** `type:frontend`, `area:assessments`, `priority:P1`, `status:ready`  
**Milestone:** M5 Assessments & Certificates

### Description

Build quiz creation and learner attempt UI.

### Tasks

- Instructor quiz builder MVP.
- Learner quiz attempt screen.
- Result screen.

### Acceptance Criteria

- Instructor can create quiz through UI.
- Learner can complete quiz.
- Learner sees result.

### Dependencies

Issue 025, Issue 026.

---

## Issue 028 — Implement certificate model and generation

**Labels:** `type:backend`, `type:database`, `area:certificates`, `priority:P1`, `status:ready`  
**Milestone:** M5 Assessments & Certificates

### Description

Implement certificate creation after course completion.

### Tasks

- Add `certificates` table.
- Generate unique certificate number.
- Add endpoint to issue certificate.
- Add HTML/PDF certificate output.

### Acceptance Criteria

- Certificate is issued after course completion.
- Certificate number is unique.
- Learner can view or download certificate.

### Dependencies

Issue 023, Issue 026.

---

## Issue 029 — Build certificates UI

**Labels:** `type:frontend`, `area:certificates`, `priority:P1`, `status:ready`  
**Milestone:** M5 Assessments & Certificates

### Description

Build learner and admin certificate screens.

### Tasks

- Learner “My certificates”.
- Certificate detail page.
- Admin/Manager certificate view by user/course.

### Acceptance Criteria

- Learner can view issued certificates.
- Manager/Admin can see certificates in reports context.

### Dependencies

Issue 028.

---

# M6 — Reports & Notifications

## Issue 030 — Implement reports API

**Labels:** `type:backend`, `area:reports`, `priority:P1`, `status:ready`  
**Milestone:** M6 Reports & Notifications

### Description

Implement MVP report endpoints.

### Tasks

- Completion by course.
- Completion by group.
- Overdue assignments.
- Assessment results.
- CSV export for completion report.

### Acceptance Criteria

- Admin can see organization-level reports.
- Manager can see group-level reports.
- CSV export works.

### Dependencies

Issue 020, Issue 023, Issue 026.

---

## Issue 031 — Build reports dashboard UI

**Labels:** `type:frontend`, `area:reports`, `priority:P1`, `status:ready`  
**Milestone:** M6 Reports & Notifications

### Description

Build reports dashboard and tables.

### Tasks

- Summary cards.
- Completion table.
- Filters by course/group/status.
- Export button.

### Acceptance Criteria

- Manager/Admin can understand learning status from dashboard.
- Filters work.
- CSV export can be triggered from UI.

### Dependencies

Issue 030.

---

## Issue 032 — Implement notifications MVP

**Labels:** `type:backend`, `type:frontend`, `area:notifications`, `priority:P1`, `status:ready`  
**Milestone:** M6 Reports & Notifications

### Description

Implement in-app notifications.

### Tasks

- Add `notifications` table.
- Create notifications for assignment created and certificate issued.
- Add notification list endpoint.
- Add mark-as-read endpoint.
- Build notification UI.

### Acceptance Criteria

- User sees notifications.
- User can mark notification as read.
- Assignment creation creates a notification.

### Dependencies

Issue 020, Issue 028.

---

## Issue 033 — Implement audit log MVP

**Labels:** `type:backend`, `type:database`, `type:security`, `area:audit`, `priority:P1`, `status:ready`  
**Milestone:** M6 Reports & Notifications

### Description

Add audit logging for critical business actions.

### Tasks

- Add `audit_logs` table.
- Log user creation.
- Log course creation/publish.
- Log assignment creation.
- Log certificate issue.
- Add admin endpoint to view logs.

### Acceptance Criteria

- Critical actions create audit records.
- Audit records include actor, action, entity, timestamp.
- Only admin can view audit logs.

### Dependencies

Issue 011, Issue 016, Issue 020, Issue 028.

---

# M7 — Deployment & Pilot Readiness

## Issue 034 — Configure Railway deployment

**Labels:** `type:devops`, `area:deployment`, `priority:P0`, `status:ready`  
**Milestone:** M7 Deployment & Pilot Readiness

### Description

Deploy API, web and PostgreSQL to Railway.

### Tasks

- Configure Railway project.
- Add API service.
- Add web service.
- Add PostgreSQL.
- Set env variables.
- Configure build/start commands.

### Acceptance Criteria

- Web app is accessible through Railway URL.
- API healthcheck is accessible.
- API connects to Railway PostgreSQL.

### Dependencies

Issue 006, Issue 007.

---

## Issue 035 — Add production environment documentation

**Labels:** `type:docs`, `type:devops`, `area:deployment`, `priority:P1`, `status:ready`  
**Milestone:** M7 Deployment & Pilot Readiness

### Description

Document deployment and environment setup.

### Tasks

- Document Railway env vars.
- Document local Docker env vars.
- Document migration process.
- Document backup considerations.

### Acceptance Criteria

- A new developer/AI-agent can deploy using docs.
- Required variables are listed.
- No real secrets are documented.

### Dependencies

Issue 034.

---

## Issue 036 — Add MVP smoke test checklist

**Labels:** `type:testing`, `type:docs`, `priority:P1`, `status:ready`  
**Milestone:** M7 Deployment & Pilot Readiness

### Description

Add a smoke test checklist for every deployment.

### Tasks

- Login as admin.
- Create learner.
- Create course.
- Add lessons.
- Publish course.
- Assign course.
- Complete course as learner.
- Generate certificate.
- Check report.

### Acceptance Criteria

- Checklist exists in docs.
- Checklist can be executed manually before release.

### Dependencies

Issue 024, Issue 028, Issue 031.

---

## Issue 037 — Pilot hardening pass

**Labels:** `type:security`, `type:testing`, `priority:P1`, `status:ready`  
**Milestone:** M7 Deployment & Pilot Readiness

### Description

Stabilize MVP before first pilot users.

### Tasks

- Fix critical UI issues.
- Review RBAC.
- Review file access.
- Review error handling.
- Review seed data.
- Run smoke tests.

### Acceptance Criteria

- No known P0 bugs.
- Core learning loop works end to end.
- MVP is ready for limited pilot.

### Dependencies

Issue 036.

---

# M8 — Future Product Growth

## Issue 038 — Prepare mobile app placeholder

**Labels:** `type:frontend`, `priority:P3`, `status:blocked`  
**Milestone:** M8 Future Product Growth

### Description

Prepare future mobile app structure without blocking MVP.

### Acceptance Criteria

- `apps/mobile` exists or is documented as future scope.
- Mobile app does not block web MVP.

### Dependencies

MVP completion.

---

## Issue 039 — Document AI features future scope

**Labels:** `type:docs`, `type:ai-agent`, `priority:P3`, `status:blocked`  
**Milestone:** M8 Future Product Growth

### Description

Document future AI features separately from MVP.

### Acceptance Criteria

- AI features are documented as future scope.
- MVP requirements do not depend on AI features.

### Dependencies

MVP completion.

---

## 3. Recommended Issue Execution Order

```text
001 → 002 → 003 → 004 → 005 → 006 → 007
008 → 009 → 010 → 011 → 012
013 → 014 → 015
016 → 017 → 018 → 019
020 → 021 → 022 → 023 → 024
025 → 026 → 027 → 028 → 029
030 → 031 → 032 → 033
034 → 035 → 036 → 037
```

---

## 4. How to use this file

1. Create labels in GitHub.
2. Create milestones in GitHub.
3. Copy each issue into GitHub Issues.
4. Assign one issue at a time to AI coding agent.
5. Require PR for each issue or small group of related issues.
6. Do not let AI-agent work on broad tasks without acceptance criteria.
