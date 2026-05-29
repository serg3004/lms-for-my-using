# API Status

Last synced: 2026-05-29  
Source branch: `feat/admin-layout-dashboard`

## Current status

Admin dashboard shell is added on top of the current MVP auth baseline:

- `/admin` is a learner-web-style protected page.
- `/admin` validates the stored bearer token through `GET /api/v1/auth/me`.
- Missing token and `401 Unauthorized` states render a sign-in link.
- The dashboard shows current user summary and links to planned admin sections.
- Admin links are shell routes for upcoming PRs: users, roles, org structure, courses, assessments, reports.
- No backend API changes were added in this PR.

## Current limitations

- No admin role-specific frontend guard yet.
- No admin CRUD screens yet.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Web route map

```text
/admin  protected admin dashboard shell
```
