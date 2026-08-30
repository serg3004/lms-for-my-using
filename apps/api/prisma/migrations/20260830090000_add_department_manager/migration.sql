-- CreateEnum
CREATE TYPE "DepartmentManagerType" AS ENUM ('DIRECT', 'FUNCTIONAL');

CREATE TABLE "department_managers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "DepartmentManagerType" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "department_managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_managers_id_organization_id_key" ON "department_managers"("id", "organization_id");
CREATE INDEX "department_managers_organization_id_department_id_type_eff_idx" ON "department_managers"("organization_id", "department_id", "type", "effective_to");
CREATE INDEX "department_managers_organization_id_user_id_effective_to_idx" ON "department_managers"("organization_id", "user_id", "effective_to");

-- Plan invariant: duplicate current (department, user, type) is forbidden.
CREATE UNIQUE INDEX "department_managers_current_department_user_type_key"
ON "department_managers" ("organization_id", "department_id", "user_id", "type")
WHERE "effective_to" IS NULL;

-- Plan invariant: at most one current primary manager per (department, type).
CREATE UNIQUE INDEX "department_managers_current_primary_type_key"
ON "department_managers" ("organization_id", "department_id", "type")
WHERE "is_primary" = TRUE AND "effective_to" IS NULL;

ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
