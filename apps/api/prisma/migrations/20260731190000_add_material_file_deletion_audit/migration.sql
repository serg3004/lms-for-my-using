CREATE TABLE "material_file_deletion_audits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "object_keys" TEXT[],
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_file_deletion_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "material_file_deletion_audits_organization_id_material_id_created_at_idx"
ON "material_file_deletion_audits"("organization_id", "material_id", "created_at");

ALTER TABLE "material_file_deletion_audits"
ADD CONSTRAINT "material_file_deletion_audits_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
