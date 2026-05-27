# API Status

Last synced: 2026-05-27  
Source branch: `feature/certificates-skeleton`

## Current status

Certificates skeleton is implemented in this branch:

- `CertificateStatus` enum and `Certificate` Prisma model.
- Migration: `apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql`.
- `GET /api/v1/certificates` returns certificates for the current learner.
- `GET /api/v1/certificates/:id` returns own certificate or a certificate visible to admin/manager/instructor roles.
- `POST /api/v1/certificates` issues a certificate for a user/course.
- Eligibility is satisfied by either completed published course lessons or a passed assessment attempt for an assessment in the course.
- Input is validated with Zod.
- Endpoints use AuthGuard, RolesGuard, and OrganizationScopeGuard where needed.
- Existing certificate for the same organization/course/user is returned instead of creating a duplicate.
- PDF generation, public verification, template editor, revocation endpoint, numbering format, and UI are deferred.

## Endpoint map

```text
GET  /api/v1/certificates
GET  /api/v1/certificates/:id
POST /api/v1/certificates
```

## Current limitations

- Certificate PDF generation is not implemented.
- Public certificate verification is not implemented.
- Certificate templates are not implemented.
- Certificate revocation endpoint is not implemented.
- Certificate UI is not implemented.
