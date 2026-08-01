# Readiness and security gates

## Health endpoints

| Endpoint | Purpose | Dependencies | Failure behavior |
| --- | --- | --- | --- |
| `GET /api/v1/health/live` | Proves the API process can serve HTTP | None | External dependency outages do not change the `200` response |
| `GET /api/v1/health/ready` | Decides whether the instance may receive traffic | PostgreSQL and each configured Redis/S3 service | Any failed check returns `503` with only a dependency status |
| `GET /api/v1/health` | Backwards-compatible readiness alias | Same as `/ready` | Same as `/ready` |

Redis and object storage report `disabled` outside environments where they are configured. Production environment validation independently requires Redis unless the explicitly documented in-memory rate-limit fallback is enabled. Readiness responses never include connection strings, bucket names, credentials, or upstream error messages.

Railway and the API container use `/api/v1/health/ready`. Operators may use `/live` to distinguish an application-process failure from a temporary dependency outage.

## Blocking security checks

Every pull request runs these independent gates:

- `pnpm audit --audit-level high` for dependency vulnerabilities;
- Gitleaks for committed secrets;
- CodeQL with `security-extended` queries for SAST;
- Trivy against both production container images for `HIGH` and `CRITICAL` findings.

Each command exits non-zero on a blocking finding. Required-check enforcement remains a repository branch-protection setting and must include both the `CI / Checks` and `CodeQL / Analyze` jobs.

## Waiver policy

Security waivers live in `security-waivers.json`. An entry requires:

```json
{
  "id": "CVE-YYYY-NNNN",
  "owner": "team-or-person",
  "reason": "Why remediation is temporarily unsafe or unavailable",
  "expires": "YYYY-MM-DD"
}
```

`pnpm security:waivers` rejects missing metadata, duplicate IDs, malformed dates, and expired entries. CI generates Trivy's ignore file only after this validation, so an unowned or expired waiver cannot suppress a container finding. Remove a waiver as soon as the finding is fixed; extensions require updating the expiry and recording the review rationale in the pull request.
