-- PR 501: a person without a mailbox can activate by organization, employee number and full name.
ALTER TABLE "users" ADD COLUMN "identity_activation" BOOLEAN NOT NULL DEFAULT false;
