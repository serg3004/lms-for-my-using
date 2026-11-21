ALTER TABLE "organizations" ADD COLUMN "login_log_retention_days" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_login_log_retention_days_check" CHECK ("login_log_retention_days" BETWEEN 90 AND 3650);

ALTER TABLE "sessions"
ADD COLUMN "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "device_label" TEXT,
ADD COLUMN "ip_masked" TEXT;

CREATE TABLE "login_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "device_label" TEXT,
    "ip_masked" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");
CREATE INDEX "login_events_organization_id_created_at_idx" ON "login_events"("organization_id", "created_at");

ALTER TABLE "login_events"
ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "login_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
