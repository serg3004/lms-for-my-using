-- CreateEnum
CREATE TYPE "ReportingLineType" AS ENUM ('DIRECT', 'FUNCTIONAL', 'PROJECT');

CREATE TABLE "reporting_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "type" "ReportingLineType" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "reporting_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reporting_lines_id_organization_id_key" ON "reporting_lines"("id", "organization_id");
CREATE INDEX "reporting_lines_organization_id_employee_id_effective_to_idx" ON "reporting_lines"("organization_id", "employee_id", "effective_to");
CREATE INDEX "reporting_lines_organization_id_manager_id_effective_to_idx" ON "reporting_lines"("organization_id", "manager_id", "effective_to");

-- Plan invariant: an employee can never report to themselves.
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_employee_not_manager_check" CHECK ("employee_id" <> "manager_id");

-- Plan invariant: duplicate current (employee, manager, type) is forbidden.
CREATE UNIQUE INDEX "reporting_lines_current_employee_manager_type_key"
ON "reporting_lines" ("organization_id", "employee_id", "manager_id", "type")
WHERE "effective_to" IS NULL;

-- Plan invariant: at most one current primary manager per (employee, type).
CREATE UNIQUE INDEX "reporting_lines_current_primary_type_key"
ON "reporting_lines" ("organization_id", "employee_id", "type")
WHERE "is_primary" = TRUE AND "effective_to" IS NULL;

ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_manager_id_organization_id_fkey" FOREIGN KEY ("manager_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
