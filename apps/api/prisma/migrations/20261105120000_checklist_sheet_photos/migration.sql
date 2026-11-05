-- PR 421: extra pictures of a checklist (additive). A checklist without rows simply has no extra pictures.
CREATE TABLE "checklist_photos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT NOT NULL DEFAULT '',
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_photos_checklist_id_order_idx" ON "checklist_photos"("checklist_id", "order");
CREATE INDEX "checklist_photos_organization_id_idx" ON "checklist_photos"("organization_id");

ALTER TABLE "checklist_photos" ADD CONSTRAINT "checklist_photos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_photos" ADD CONSTRAINT "checklist_photos_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
