# API Status

Last synced: 2026-05-27  
Source branch: `feature/openapi-swagger-skeleton`

## Current status

OpenAPI document skeleton is implemented in this branch:

- Added `GET /api/v1/openapi`.
- Added static OpenAPI 3.0.3 JSON document builder.
- Added API metadata: title, description, version, and `/api/v1` server.
- Added Bearer JWT security scheme.
- Added common centralized API error response schema from PR #52.
- Added initial path coverage for health, auth, organization registration, users, and certificates.
- Added unit tests for document shape, error response schema, and key documented paths.
- No `@nestjs/swagger` dependency was added, so `pnpm-lock.yaml` remains unchanged.
- Swagger UI, full DTO schemas, generated clients, and published `openapi.json` artifacts remain deferred.

## Endpoint map

```text
GET /api/v1/openapi
```

## Current limitations

- Swagger UI is not implemented yet.
- `@nestjs/swagger` decorators/integration are not implemented yet.
- Full request/response schemas for every endpoint are not implemented yet.
- Generated OpenAPI client is not implemented yet.
- Published `openapi.json` artifact is not implemented yet.
