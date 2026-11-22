# Account life cycle: acceptance and operations

Purpose: how an operator checks that user accounts work end to end, and what the automated tests already guard (PR 498, stage 13 of `docs/product/future/USER_ONBOARDING_AND_ACCOUNTS_PLAN.md`).

## What the tests guard

- `apps/api/src/integration/account-lifecycle.database.spec.ts` (real HTTP stack and Postgres): invite without a password, accept the link once, sign in, change the password (the old one stops working), lock after a series of wrong passwords, unlock by an administrator, archive, restore. It also checks that no password, invitation token or hash appears in the audit log, the application log or any API answer; the invitation link is returned once, in the answer that created it, and only when no mail provider is configured.
- `apps/api/src/modules/auth/account-mail-language.spec.ts`: every mail and Telegram text of the plan (invitation, lockout notice, password change notice, QR sign-in notice, Telegram bound, invalid link, invitation, activation, temporary password) is written in the recipient's language (`User.locale`), falls back to Russian for an unknown language, has no unfilled placeholder, and carries no password except the Telegram temporary password.
- One test per feature (PR 487 to 507) stays in `apps/api/src/integration/*.database.spec.ts`, `apps/e2e` and `apps/web`.

## Manual check before a release that touches accounts

1. Invite a person with a mail provider configured (`BREVO_API_KEY` or SMTP): the mail arrives in the language chosen at creation; the link works once and expires in 7 days.
2. Sign in, change the password in the profile: other devices are signed out and a notice mail arrives.
3. Enter wrong passwords up to the organization threshold: the answer stays the same as for an unknown account, a notice mail arrives, an administrator lifts the lock on the "Security" page.
4. Archive and restore a person who has signed in: after restore they are `active` and sign in with their old password (a person who never signed in goes back to `invited` and gets a fresh link).

## Known limits

- The password reset mail (`auth/password-reset.ts`) is still Russian only and is not part of this plan; its wording is not covered by the language guard.
- Owner checks that need real devices (phone, tablet, mail inbox) stay in `docs/product/future/OWNER_CHECKS.md`.
