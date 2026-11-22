-- PR 506: QR badge of an employee (kiosk sign-in for assigned work only).
ALTER TABLE "organizations"
  ADD COLUMN "badge_pin_required" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "badge_idle_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "sessions" ADD COLUMN "via_badge" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "user_badges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "pin_hash" TEXT,
  "state" TEXT NOT NULL DEFAULT 'active',
  "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issued_by_id" UUID,
  "revoked_at" TIMESTAMPTZ,
  "revoked_by_id" UUID,
  "last_used_at" TIMESTAMPTZ,
  "pin_failures" INTEGER NOT NULL DEFAULT 0,
  "pin_locked_until" TIMESTAMPTZ,
  CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_badges_token_hash_key" ON "user_badges"("token_hash");
CREATE INDEX "user_badges_user_id_organization_id_idx" ON "user_badges"("user_id", "organization_id");
-- One active badge per person: issuing a new one revokes the old one in the same transaction.
CREATE UNIQUE INDEX "user_badges_one_active_per_user" ON "user_badges"("user_id") WHERE "state" = 'active';

ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
