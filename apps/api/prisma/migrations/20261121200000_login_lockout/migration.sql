ALTER TABLE "organizations"
ADD COLUMN "login_max_failures" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "login_failure_window_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "login_lock_minutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_login_max_failures_check" CHECK ("login_max_failures" BETWEEN 3 AND 20),
ADD CONSTRAINT "organizations_login_failure_window_minutes_check" CHECK ("login_failure_window_minutes" BETWEEN 1 AND 120),
ADD CONSTRAINT "organizations_login_lock_minutes_check" CHECK ("login_lock_minutes" BETWEEN 1 AND 1440);

ALTER TABLE "users" ADD COLUMN "login_locked_until" TIMESTAMPTZ(6);

CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_user_id_created_at_idx" ON "login_attempts"("user_id", "created_at");
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts"("created_at");

ALTER TABLE "login_attempts"
ADD CONSTRAINT "login_attempts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
