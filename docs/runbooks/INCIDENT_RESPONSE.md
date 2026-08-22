# Security incident response

This runbook covers suspected or confirmed disclosure of JWT signing material,
refresh tokens, PostgreSQL credentials, or S3-compatible storage credentials.
It is written for production operators; never paste a secret, token, cookie,
connection string, customer object, or personal data into tickets or chat.

## Ownership, severity, and clocks

The first responder opens an incident record, assigns the roles below, records all
times in UTC, and starts the applicable clock at the first credible report.

| Role | Default owner | Responsibility |
| --- | --- | --- |
| Incident commander (IC) | on-call platform engineer | severity, decisions, timeline, handoffs, closure |
| Technical lead | API/service owner | containment, rotation, revocation, validation |
| Communications lead | product owner | internal, customer, regulator, and processor notices |
| Evidence custodian | security owner | evidence inventory, access log, retention, legal hold |

One person may initially hold several roles, but the IC must explicitly record
that choice. Page the security owner immediately for any credential exposure.

| Severity | Definition | Acknowledge | Escalate | Status cadence |
| --- | --- | --- | --- | --- |
| SEV-1 | confirmed active compromise, cross-tenant/data exfiltration, signing key or production DB credential exposed | 15 min | security and product owners immediately | every 30 min |
| SEV-2 | credible exposure with no confirmed use, scoped S3 credential, or refresh token set | 30 min | security owner within 30 min | hourly |
| SEV-3 | suspicious event contained by controls, no production secret or data access demonstrated | 4 h | service owner same business day | at material changes |

When uncertain, choose the higher severity. The communications lead and legal or
privacy owner determine notification duties and deadlines from affected people,
data categories, contracts, and jurisdictions; the team must not wait for the
postmortem to make that assessment.

## First 15 minutes: classify without destroying evidence

1. Create a restricted incident record with ID, reporter, detection time, UTC
   timeline, suspected secret class, environment, tenant/data scope, and current
   severity. Link only access-controlled evidence locations.
2. Appoint the four roles. Establish a restricted incident channel and an
   out-of-band contact path in case primary identity systems are affected.
3. Preserve relevant immutable provider audit logs, deployment/configuration
   history, authentication/audit events, object access logs, and alert snapshots.
   Export by time range and record source, collector, UTC time, SHA-256, and
   destination. Do not image or query unrelated customer data.
4. Do **not** validate a leaked credential against production. Do not revoke or
   rotate until the technical lead has mapped dependencies, unless ongoing harm
   requires emergency containment. Record every emergency decision.
5. Classify the material: JWT signing secret, refresh/access token, PostgreSQL
   credential, S3 access key, or multiple/unknown. Assume derived tokens and
   copied credentials are compromised until disproved.

## Common containment

- Freeze non-incident deployments and credential changes; snapshot the current
  release/configuration metadata without secret values.
- Remove the disclosure at its source while preserving a restricted copy when
  legally permitted. Revoke public links, CI artifacts, logs, or chat messages.
- Restrict ingress/egress or disable the affected principal rather than taking
  destructive actions. Never delete evidence or rotate audit-log credentials
  before exports are secured.
- Search secret-manager access logs and version history, CI logs, repository
  history, deployment events, authentication anomalies, database audit logs,
  and storage access logs using identifiers and timestamps—not raw secrets.
- Treat rollback as code rollback only: restoring an old deployment does not
  restore trust in an exposed credential.

## Rotation and revocation playbooks

Use the production secret manager/provider UI or audited CLI. Commands below use
placeholders deliberately; enter real values only through approved secret
injection. For every step record operator, UTC time, provider change/audit ID,
validation result, and rollback decision.

### JWT signing secret or broad token uncertainty

The service currently verifies one `JWT_SECRET`, so rotation is a hard cutover:

1. Generate at least 32 cryptographically random bytes in the secret manager.
   Never print or copy the value into a shell history or incident record.
2. Stage the new secret for every API replica/job consumer, then deploy/restart
   them in one controlled change. Mixed old/new replicas cause inconsistent auth.
3. Revoke **all** database sessions in the same containment window. Run the
   audited statement through the production database console:

   ```sql
   BEGIN;
   UPDATE "sessions"
   SET "revoked_at" = CURRENT_TIMESTAMP,
       "refresh_token_hash" = NULL
   WHERE "revoked_at" IS NULL;
   COMMIT;
   ```

4. Confirm the affected-session count in the database audit result. Test that a
   pre-incident access token and refresh cookie are rejected, then sign in with a
   dedicated canary account and confirm refresh rotation works.
5. Remove the old secret version after all replicas report the new deployment;
   monitor login failures, refresh reuse, 401 rate, and API health for 60 minutes.
   Users must sign in again. A code rollback must retain the **new** secret.

For one known user/token and no signing-key exposure, use `POST
/api/v1/auth/logout-all` while authenticated as that user. If that is impossible,
revoke that user's active `Session` rows through an approved audited DB change.
Never put a raw access or refresh token in the incident record.

### PostgreSQL credential

1. Create a new least-privilege application principal/password (prefer a new
   principal so old and new connections are distinguishable). Preserve database
   and provider audit logs first.
2. Store the new connection URL as a new secret version, update API, workers,
   migrations, backup/restore automation, and monitoring, then roll instances.
3. Verify `/health`, a canary login/read, worker health, migration connectivity,
   pool saturation, and database authentication errors.
4. Disable the old principal, terminate its remaining connections, and confirm
   new authentication attempts fail. Do not drop it until evidence collection
   and rollback review are complete.
5. Investigate queries, exports, schema changes, and connections attributable to
   the old principal. Rotate downstream secrets found in database/configuration
   data and invoke the backup runbook if integrity or availability is uncertain.

### S3-compatible storage credential

1. Create a replacement key on the same least-privilege service principal, or a
   new principal when attribution requires it. Do not change bucket policy and
   key simultaneously unless active misuse requires it.
2. Store new `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` versions; roll API,
   workers, malware scanning/lifecycle jobs, and backup automation that use them.
3. With a canary object, verify upload, scan/quarantine path, signed download,
   and lifecycle/backup access. Never use customer content as the canary.
4. Disable/delete the old key and prove it can no longer list, read, write, or
   delete. Review object access logs for bulk reads, policy changes, deletion,
   overwrite, and unusual source networks; enable object/version recovery when
   integrity is in doubt.
5. Rotate presigned URLs by rotating the signing credential; bound residual URL
   exposure by their configured TTL. Check bucket policy, CORS, public access,
   retention, versioning, and replication independently of key rotation.

### Refresh-token-only disclosure

Revoke the owning user's sessions with `POST /api/v1/auth/logout-all` or the
approved scoped database operation, confirm `revokedAt` is populated and refresh
hashes are unusable, and inspect refresh-reuse and login events. Escalate to the
JWT procedure if ownership/scope is unknown or access tokens/signing material may
also be exposed.

## Validation and recovery gate

The IC may declare containment only after all applicable old credentials fail,
all application replicas and jobs use the replacement, sessions are revoked at
the required scope, health/canary flows pass, and monitoring shows no continuing
misuse. Recovery additionally requires:

- an affected-assets and tenants assessment with confidence and gaps;
- evidence inventory and chain-of-custody review;
- security-owner approval of monitoring duration and any temporary controls;
- communications-lead decision recorded for customer, processor, insurer,
  regulator, and law-enforcement notification (including “not required” basis);
- follow-up owners and deadlines in the incident record.

If validation fails, keep the old credential disabled, roll application code back
without restoring secrets, and escalate. For database/object loss or corruption,
follow [backup, restore, and disaster recovery](BACKUP_RESTORE_DISASTER_RECOVERY.md).

## Evidence handling

Store evidence encrypted in the restricted incident repository. Each item needs
an evidence ID, source, collector, collection time in UTC, SHA-256, access list,
and retention/legal-hold decision. Preserve originals read-only; analyze copies.
Log every access and transfer. Redact secrets and unnecessary personal data from
working notes and notifications. The evidence custodian controls deletion after
legal/privacy approval and the documented retention period.

## Communications

Use incident ID, verified impact, affected window, containment state, customer
actions, and next update time. Never speculate or disclose exploit details or
credentials. The communications lead obtains legal/privacy approval and tracks
contractual and jurisdictional clocks. Notify affected processors/vendors through
registered security channels. Only the communications lead or delegate sends
external messages; preserve copies and delivery evidence.

## Closure and blameless postmortem

Within 2 business days, publish an internal preliminary timeline and outstanding
risk. Within 5 business days of recovery, hold a blameless review covering root
and contributing causes, detection and response gaps, data/tenant impact,
notification decisions, control effectiveness, and where the runbook diverged.
Every action has one owner, priority, due date, and verification evidence. Track
high-risk actions to closure and test them. The IC schedules another tabletop at
least annually and after material auth/storage architecture changes.

## Incident record checklist

- [ ] ID, severity, detection/classification times, roles, contact path
- [ ] Scope: environment, credential classes, data/tenants, confidence and gaps
- [ ] UTC timeline and decision log, including deploy/provider/audit change IDs
- [ ] Evidence inventory, hashes, custody/access log, retention/legal hold
- [ ] Old credentials rejected; new credentials deployed to every dependency
- [ ] Required sessions revoked; pre-incident tokens rejected; canaries healthy
- [ ] Monitoring window and exit criteria completed
- [ ] Legal/privacy and external-notification decisions with deadlines/basis
- [ ] Recovery approval, follow-up owners/dates, postmortem and next exercise
