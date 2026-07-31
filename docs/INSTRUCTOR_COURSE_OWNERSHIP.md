# Instructor course ownership

PR 176 introduces an explicit many-to-many assignment between instructors and
courses. A course may have multiple instructors and an instructor may own
multiple courses.

`CourseAccessPolicy` is the single authorization boundary for course-bound
instructor operations. It applies these rules:

- an instructor can list, read, or mutate only assigned courses and their child
  resources;
- a newly created course is assigned to the instructor who created it;
- an unassigned or missing resource returns the same `404` response to avoid
  disclosing resource existence;
- an admin, including a user with both admin and instructor memberships, keeps
  organization-wide access;
- manager and learner scoping remains governed by their dedicated policies.

The seed assigns `instructor@demo.com` to the demo course. The
`course_instructors` primary key prevents duplicate assignments, while its
organization indexes support scoped list and ownership queries.
