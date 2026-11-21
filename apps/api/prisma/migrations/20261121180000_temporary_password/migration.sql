-- PR 489: temporary password and the forced change at the first sign-in (additive).
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "temporary_password_expires_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN "temporary_password_used_at" TIMESTAMPTZ;
