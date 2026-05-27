# Project Log

## 2026-05-27

### Centralized API error format

Implemented PR #52 scope on `feature/centralized-api-error-format`.

Changes:
- Added global `ApiExceptionFilter`.
- Registered centralized exception handling in `main.ts`.
- Added normalized error response shape with `statusCode`, `error.code`, `error.message`, optional `error.details`, `path`, and `timestamp`.
- Added Zod error normalization with field-level details.
- Added Nest HTTP exception normalization.
- Added Prisma-like request error normalization with `P2002` mapped to conflict.
- Added safe fallback for unknown errors without leaking internal messages.
- Added tests for validation errors, HTTP exceptions, unknown errors, and bad request message arrays.
- Updated README, API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```
