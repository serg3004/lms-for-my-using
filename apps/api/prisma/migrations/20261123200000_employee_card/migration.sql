-- PR 507: employee card opened by scanning a badge.
ALTER TABLE "organizations"
  ADD COLUMN "employee_card_blocks" TEXT[] NOT NULL DEFAULT ARRAY['courses', 'certificates', 'checklists', 'clearance']::TEXT[];

CREATE TABLE "external_inspectors" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "visible_blocks" TEXT[] NOT NULL,
  "access_until" TIMESTAMPTZ NOT NULL,
  "created_by_id" UUID,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_inspectors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_inspectors_user_id_key" ON "external_inspectors"("user_id");
CREATE INDEX "external_inspectors_organization_id_access_until_idx" ON "external_inspectors"("organization_id", "access_until");
ALTER TABLE "external_inspectors" ADD CONSTRAINT "external_inspectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "badge_scan_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_scan_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "badge_scan_logs_user_id_created_at_idx" ON "badge_scan_logs"("user_id", "created_at");
CREATE INDEX "badge_scan_logs_organization_id_created_at_idx" ON "badge_scan_logs"("organization_id", "created_at");
