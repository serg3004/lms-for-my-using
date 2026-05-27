# API Status

Last synced: 2026-05-27  
Source branch: `fix/handle-zod-validation-errors`

## Current status

Zod validation errors are normalized through the centralized API error format:

- `ApiExceptionFilter` maps `ZodError` to `400 Bad Request`.
- Validation failures use error code `VALIDATION_ERROR`.
- Integration coverage includes a direct Zod validation error route.
- Integration coverage includes `POST /api/v1/auth/login` invalid body from `schema.parse(body)` returning `400 Bad Request`.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No API endpoint changes.

## Endpoint map

No API endpoint changes in this PR.
