-- PR 395: checklist folders (additive). A checklist without folder_id lives at the root.
CREATE TABLE "checklist_folders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "visible_to_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "checklist_folders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "checklists" ADD COLUMN "folder_id" UUID;

CREATE INDEX "checklist_folders_organization_id_parent_id_idx" ON "checklist_folders"("organization_id", "parent_id");
CREATE INDEX "checklists_organization_id_folder_id_idx" ON "checklists"("organization_id", "folder_id");

ALTER TABLE "checklist_folders" ADD CONSTRAINT "checklist_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_folders" ADD CONSTRAINT "checklist_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "checklist_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_folders" ADD CONSTRAINT "checklist_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "checklist_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
