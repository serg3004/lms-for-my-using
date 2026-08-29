CREATE TYPE "DepartmentStatus" AS ENUM ('active', 'archived');
CREATE TYPE "DepartmentManagerMode" AS ENUM ('LOCAL', 'INHERIT', 'MERGE');

CREATE TABLE "department_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "department_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "department_type_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'active',
    "direct_manager_mode" "DepartmentManagerMode" NOT NULL DEFAULT 'LOCAL',
    "functional_manager_mode" "DepartmentManagerMode" NOT NULL DEFAULT 'LOCAL',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_not_self_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE TABLE "org_structure_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "event_type" TEXT NOT NULL,
    "operation_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_structure_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_id_organization_id_key" ON "users"("id", "organization_id");
CREATE UNIQUE INDEX "department_types_organization_id_code_key" ON "department_types"("organization_id", "code");
CREATE UNIQUE INDEX "department_types_id_organization_id_key" ON "department_types"("id", "organization_id");
CREATE INDEX "department_types_organization_id_is_active_sort_order_idx" ON "department_types"("organization_id", "is_active", "sort_order");
CREATE UNIQUE INDEX "departments_id_organization_id_key" ON "departments"("id", "organization_id");
CREATE UNIQUE INDEX "departments_org_code_key" ON "departments"("organization_id", "code") WHERE "code" IS NOT NULL;
CREATE INDEX "departments_organization_id_parent_id_status_sort_order_idx" ON "departments"("organization_id", "parent_id", "status", "sort_order");
CREATE INDEX "departments_organization_id_department_type_id_idx" ON "departments"("organization_id", "department_type_id");
CREATE INDEX "org_structure_events_organization_id_created_at_idx" ON "org_structure_events"("organization_id", "created_at");
CREATE INDEX "org_structure_events_organization_id_entity_type_entity_id_created_at_idx" ON "org_structure_events"("organization_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "org_structure_events_organization_id_operation_id_idx" ON "org_structure_events"("organization_id", "operation_id");
CREATE INDEX "org_structure_events_organization_id_actor_id_idx" ON "org_structure_events"("organization_id", "actor_id");

ALTER TABLE "department_types" ADD CONSTRAINT "department_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_organization_id_fkey" FOREIGN KEY ("parent_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_department_type_id_organization_id_fkey" FOREIGN KEY ("department_type_id", "organization_id") REFERENCES "department_types"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "org_structure_events" ADD CONSTRAINT "org_structure_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_structure_events" ADD CONSTRAINT "org_structure_events_actor_id_organization_id_fkey" FOREIGN KEY ("actor_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;
