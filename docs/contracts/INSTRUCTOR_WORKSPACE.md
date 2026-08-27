# Instructor workspace

## MVP boundaries

The instructor workspace is a separate, authenticated frontend area. It is not
an alternative admin interface: an instructor-only account cannot open
`/admin/*`, and admin or manager roles do not implicitly grant access to
`/instructor/*`.

Instructor course ownership is enforced by the API rather than by a client-side
query parameter. For an instructor-only actor, course list queries are filtered
through active `CourseInstructor` records. Reads and writes for an individual
course and its course-bound resources use the same ownership policy. The full
data-model and API rules are documented in
[`INSTRUCTOR_COURSE_OWNERSHIP.md`](./INSTRUCTOR_COURSE_OWNERSHIP.md).

## Routes and navigation

| Route | Purpose | Instructor navigation |
| --- | --- | --- |
| `/instructor` | Redirect to the dashboard | — |
| `/instructor/dashboard` | Owned-course summary | Dashboard |
| `/instructor/courses` | Owned-course list | Courses |
| `/instructor/courses/new` | Create a course and assign its creator as instructor | — |
| `/instructor/courses/:courseId/edit` | Edit an owned course | — |
| `/instructor/courses/:courseId/students` | View learner progress for an owned course | — |
| `/instructor/checklists` | Review assigned checklist submissions | Checklists |

The workspace top bar also exposes the account switcher for users with multiple
roles, the language switcher, and logout. Deep pages remain part of the Courses
navigation section.

## Access rules

- All `/instructor/*` routes require an authenticated user with the
  `instructor` role.
- `/admin/*` accepts `admin` and `manager`; the `instructor` role alone is
  explicitly rejected.
- Course creation atomically creates the course and restores/creates the
  instructor ownership record for the instructor who created it.
- Instructor-only course list, detail, mutation, and course-resource access is
  limited to active ownership records in the current organization. Missing or
  foreign ownership is exposed as not found rather than leaking the resource.
- A multi-role user who is also an admin is not course-scoped by the instructor
  policy and uses the admin workspace as their default management surface.

Route authorization is defined in `apps/web/src/app/navigationPolicy.ts` and
course ownership is defined in
`apps/api/src/modules/course-access/course-access.policy.ts`.
