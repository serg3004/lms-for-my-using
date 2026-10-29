-- PR 367: administrator-only deletion of finished results (reason + actor) and organization templates.
ALTER TABLE "checklist_instances" ADD COLUMN "result_delete_reason" TEXT;
ALTER TABLE "checklist_instances" ADD COLUMN "result_deleted_by" UUID;

CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB NOT NULL,
    "group_count" INTEGER NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_templates_organization_id_deleted_at_idx" ON "checklist_templates"("organization_id", "deleted_at");

ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
