# API Status

Last synced: 2026-05-28  
Source branch: `feature/learner-lesson-materials`

## Current status

Learner lesson materials web flow is available for the current MVP baseline:

- `/learn/lessons/:id/materials` is implemented in `apps/web`.
- The frontend API client calls the existing `GET /api/v1/lessons/:id` endpoint to resolve the lesson course.
- The frontend API client calls the existing `GET /api/v1/courses/:courseId/materials` endpoint and filters materials by `lessonId`.
- The lesson detail page links to the lesson materials page.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` responses show a basic not-found state.
- Empty lesson materials show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No material upload/edit UI.
- No material detail page.
- No progress UI.
- No lesson completion action.
- No enrollment UI.
- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses existing contracts:

```text
GET /api/v1/lessons/:id
GET /api/v1/courses/:courseId/materials
```
