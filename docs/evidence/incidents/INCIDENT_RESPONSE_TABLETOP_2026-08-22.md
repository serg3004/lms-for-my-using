# Incident response tabletop — 2026-08-22

## Exercise record

- **Type:** documentation/tabletop exercise; no production credentials or systems used
- **Scenario:** a repository scanner reports a possible production JWT signing
  secret in a CI artifact; storage access logs then show an unusual S3 read burst
- **Participants/roles simulated:** platform on-call (IC), API owner (technical
  lead), security owner (evidence custodian), product owner (communications lead)
- **Objective:** prove that classification, evidence preservation, JWT rotation,
  global session revocation, S3 rotation, validation, notification assessment,
  and recovery have an unambiguous order and owner
- **Result:** PASS with follow-up documentation improvements incorporated into
  `INCIDENT_RESPONSE.md`; production execution remains an incident-only action

## Walkthrough and evidence

| Inject / checkpoint | Expected decision and action | Result |
| --- | --- | --- |
| Secret scanner alert, uncertain validity | Start at SEV-1, page security/product owners, assign roles and restricted record; do not test the value | Pass |
| CI artifact may expire soon | Preserve artifact metadata, audit/config/deploy logs and hashes before removal; restrict the artifact | Pass |
| API replicas use one signing secret | Generate in secret manager, coordinated restart, globally revoke sessions, reject old tokens, canary login/refresh | Pass |
| S3 reads may be related | Preserve access logs, replace/roll/validate key, disable old key, inspect policies and object integrity | Pass |
| Service fails after code rollback | Keep replacement secrets; rollback code only and investigate configuration compatibility | Pass |
| Scope is unclear at 30 minutes | Maintain SEV-1, send verified internal update, legal/privacy starts jurisdiction and contract clock assessment | Pass |
| Containment claimed | Require old credentials rejected, every dependency on replacements, session count evidence, canaries and monitoring | Pass |
| Closure requested immediately | Require impact/evidence/notification decisions, recovery approvals, preliminary report and dated postmortem actions | Pass |

## Timed outcome

The paper timeline met the SEV-1 targets: acknowledgement at T+5 minutes, role and
severity assignment at T+10, owner escalation at T+12, containment plan at T+25,
and first status update at T+30. No claim is made about production RTO because no
production change was performed.

## Findings resolved during the exercise

1. **Global revocation was ambiguous.** The runbook now includes a transactional,
   auditable `Session` update that clears refresh hashes and revokes active rows.
2. **Rotation order and rollback were unclear.** Per-secret dual/new credential
   rollout, validation, old-key disablement, and “never roll back a secret” rules
   are explicit.
3. **Evidence and notification ownership was implicit.** Named roles, custody
   fields, decision records, response clocks, and communications gates are now
   required.
4. **S3 validation could touch customer data.** The procedure mandates a dedicated
   canary object and separate checks for policy and object integrity.

## Follow-up

- **Security owner — due 2026-09-05:** enter real on-call aliases, legal/privacy
  contacts, secret-manager locations, and provider escalation paths in the
  access-controlled operations system (they do not belong in this repository).
- **Platform owner — due 2026-09-05:** schedule an authorized staging drill that
  captures provider/deployment audit IDs and measured rollout time.
- **IC program owner — due 2027-08-22 or after a material auth/storage change:**
  repeat the tabletop and link the restricted exercise record from the tracker.
