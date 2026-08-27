# Frontend MVP maintainability audit

## Status

Recalculated 2026-08-06 against current `apps/web/src/app` file sizes. The app is deployed to production; the previous revision of this document predated launch and gated cleanup on "staging smoke," which no longer applies.

## Largest pages (current)

Exact file sizes from `apps/web/src/app`:

| File | Size | Risk |
| --- | ---: | --- |
| `AdminMaterialsPage.tsx` | 24.7 KB | High |
| `AdminOrgStructurePage.tsx` | 21.9 KB | High |
| `AdminCourseBuilderPage.tsx` | 20.5 KB | High |
| `AdminCoursesPage.tsx` | 19.6 KB | Medium |
| `LearnerAssessmentTakingPage.tsx` | 19.1 KB | Medium |
| `InstructorCourseFormPage.tsx` | 18.5 KB | Medium |
| `AdminAssignmentCompletionPage.tsx` | 18.1 KB | Medium |
| `AdminThemeSettingsPage.tsx` | 16.8 KB | Medium |
| `AdminLessonsPage.tsx` | 16.8 KB | Medium |

Changes since the previous (pre-launch) revision of this audit:

- `AdminOrgStructurePage.tsx`, `AdminCourseBuilderPage.tsx`, `AdminCoursesPage.tsx`, `AdminThemeSettingsPage.tsx`, and `InstructorCourseFormPage.tsx` did not exist or were far smaller at the time of the original audit; they are now among the largest pages after feature work (group member/manager management, course builder i18n, course instructor management, theme settings rework, instructor role pages).
- `AdminAssessmentBuilderPage.tsx` shrank from 21.1 KB to 14.4 KB and is no longer in the highest-risk group.
- `App.tsx` shrank from 14.3 KB to 1.2 KB — route config was already extracted elsewhere; the prior cleanup target here is done.
- `AdminUsersPage.tsx` shrank from 12.8 KB to 4.2 KB — logic was already extracted into `apps/web/src/features/admin-users/`; the prior cleanup target here is done.

## Cleanup already applied

- `LearnerCoursesPage.tsx`: course list rendering moved into a local leaf component (kept data loading, routing, and UI output unchanged).
- `App.tsx`: route composition extracted out of the page file (no longer a large file).
- `AdminUsersPage.tsx`: page logic extracted into `apps/web/src/features/admin-users/` (mappers, model, form validation).

## Current cleanup targets

Keep changes behavior-preserving and land them as small, separate PRs, one page at a time, with tests updated only where the extraction touches logic rather than pure JSX separation:

1. `AdminMaterialsPage.tsx`: extract upload field and progress UI into a leaf component.
2. `AdminOrgStructurePage.tsx`: extract group member/manager management dialogs into leaf components.
3. `AdminCourseBuilderPage.tsx`: extract lesson list/editor sections into leaf components.
4. `AdminCoursesPage.tsx`: extract the course instructor management dialog into a leaf component.

## Guardrails

- Keep changes behavior-preserving.
- Do not change routes, permissions, auth, or API contracts.
- Do not introduce a new UI kit or styling system.
- Prefer local leaf component extractions over cross-app abstractions.
- Add or update frontend tests only when the cleanup touches logic, not pure JSX separation.

## Rollback

Revert the specific cleanup PR to restore the previous page structure for that page.
