BEGIN;

CREATE TABLE "library_folders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'purple',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "library_folders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_folders_organization_id_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "library_folders_scope_check" CHECK ("scope" IN ('course', 'assignment')),
    CONSTRAINT "library_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "library_folders_organization_id_parent_id_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "library_folders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "library_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "courses"
    ADD COLUMN "folder_id" UUID,
    ADD CONSTRAINT "courses_organization_id_folder_id_fkey" FOREIGN KEY ("organization_id", "folder_id") REFERENCES "library_folders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assignments"
    ADD COLUMN "folder_id" UUID,
    ADD CONSTRAINT "assignments_organization_id_folder_id_fkey" FOREIGN KEY ("organization_id", "folder_id") REFERENCES "library_folders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "library_folders_organization_id_scope_parent_id_idx" ON "library_folders"("organization_id", "scope", "parent_id");
CREATE INDEX "courses_organization_id_folder_id_idx" ON "courses"("organization_id", "folder_id");
CREATE INDEX "assignments_organization_id_folder_id_idx" ON "assignments"("organization_id", "folder_id");

COMMIT;
