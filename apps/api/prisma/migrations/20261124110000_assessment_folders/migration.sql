BEGIN;

CREATE TABLE "assessment_folders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "assessment_folders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_folders_organization_id_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "assessment_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assessment_folders_organization_id_parent_id_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "assessment_folders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assessment_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "assessments"
    ADD COLUMN "folder_id" UUID,
    ADD COLUMN "is_longread_exercise" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "assessments_organization_id_folder_id_fkey" FOREIGN KEY ("organization_id", "folder_id") REFERENCES "assessment_folders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "assessments_longread_exercise_at_root_check" CHECK (NOT "is_longread_exercise" OR "folder_id" IS NULL);

-- Both legacy longread creation paths used these UUID slug formats.
UPDATE "assessments"
SET "is_longread_exercise" = true
WHERE "slug" ~ '^longread-(restored-)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE INDEX "assessment_folders_organization_id_parent_id_idx" ON "assessment_folders"("organization_id", "parent_id");
CREATE INDEX "assessments_organization_id_folder_id_idx" ON "assessments"("organization_id", "folder_id");

COMMIT;
