-- CreateEnum
CREATE TYPE "OrgExternalReferenceEntityType" AS ENUM ('DEPARTMENT', 'DEPARTMENT_TYPE', 'POSITION');

CREATE TABLE "org_external_references" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" "OrgExternalReferenceEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "org_external_references_pkey" PRIMARY KEY ("id")
);

-- Plan invariant: one (organization, source system, entity type, external id) tuple maps to
-- exactly one internal entity; a duplicate insert is a database-level conflict, never a silent
-- remap to a different entityId.
CREATE UNIQUE INDEX "org_external_references_org_source_type_external_key"
ON "org_external_references" ("organization_id", "source_system", "entity_type", "external_id");

CREATE INDEX "org_external_references_organization_id_entity_type_entit_idx"
ON "org_external_references" ("organization_id", "entity_type", "entity_id");

ALTER TABLE "org_external_references" ADD CONSTRAINT "org_external_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
