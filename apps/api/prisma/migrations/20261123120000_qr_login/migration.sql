-- PR 505: sign-in by QR confirmed on a phone.
ALTER TABLE "organizations"
  ADD COLUMN "qr_login_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "qr_login_session_hours" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "qr_login_roles" TEXT[] DEFAULT ARRAY['learner', 'mentor', 'instructor']::TEXT[];

ALTER TABLE "sessions"
  ADD COLUMN "via_qr" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "max_expires_at" TIMESTAMPTZ;

CREATE TABLE "qr_login_requests" (
  "id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "poll_hash" TEXT NOT NULL,
  "device_label" TEXT,
  "ip_masked" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "decided_at" TIMESTAMPTZ,
  CONSTRAINT "qr_login_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qr_login_requests_code_hash_key" ON "qr_login_requests"("code_hash");
CREATE UNIQUE INDEX "qr_login_requests_poll_hash_key" ON "qr_login_requests"("poll_hash");
CREATE INDEX "qr_login_requests_expires_at_idx" ON "qr_login_requests"("expires_at");
CREATE INDEX "qr_login_requests_ip_masked_created_at_idx" ON "qr_login_requests"("ip_masked", "created_at");

ALTER TABLE "qr_login_requests" ADD CONSTRAINT "qr_login_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
