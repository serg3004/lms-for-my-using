# API Status

Last synced: 2026-05-28  
Source branch: `feature/learner-certificate-report-shell`

## Current status

Learner certificate list/detail web flow is available for the current MVP baseline:

- `/learn/certificates` is implemented in `apps/web`.
- `/learn/certificates/:id` is implemented in `apps/web`.
- The learner home page links to the certificates page.
- The frontend API client calls the existing `GET /api/v1/certificates` endpoint.
- The frontend API client calls the existing `GET /api/v1/certificates/:id` endpoint.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` certificate detail responses show a basic not-found state.
- Empty certificate lists show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No certificate generation UI.
- No certificate download/export/PDF UI.
- No reports UI.
- No filters/search/sort.
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
GET /api/v1/certificates
GET /api/v1/certificates/:id
```
