# API Status

Last synced: 2026-05-27  
Source branch: `feature/centralized-api-error-format`

## Current status

Centralized API error format is implemented in this branch:

- Added global `ApiExceptionFilter`.
- Registered the filter in `apps/api/src/main.ts`.
- Zod errors return `400 VALIDATION_ERROR` with field-level details.
- Nest HTTP exceptions return normalized HTTP error codes such as `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `CONFLICT`.
- Prisma-like request errors return `DATABASE_ERROR`, with `P2002` mapped to `409 CONFLICT`.
- Unknown errors return `500 INTERNAL_SERVER_ERROR` without leaking internal error messages.
- Added tests for validation errors, HTTP exceptions, unknown errors, and bad request message arrays.

## Error response shape

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email",
        "code": "invalid_string"
      }
    ]
  },
  "path": "/api/v1/example",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

## Current limitations

- OpenAPI / Swagger schema documentation is not implemented yet.
- Integration tests are not implemented yet.
