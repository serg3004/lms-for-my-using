-- PR 296: Observation Sheet Builder.
-- Hand-written (not `prisma migrate dev`, non-interactive in this sandbox) and isolated via
-- `prisma migrate diff --shadow-database-url <fresh db>` from unrelated pre-existing
-- schema.prisma/migration-history drift already present on main (same drift PR 293 documented).
-- All changes here are additive/backward-compatible: new nullable/defaulted columns, a new table,
-- and a nullable FK -- no existing row, query, or snapshot is invalidated.

-- CreateEnum
CREATE TYPE "ChecklistPreSessionVisibility" AS ENUM ('full', 'structure_only', 'none');

-- CreateEnum
CREATE TYPE "ChecklistContextFieldType" AS ENUM ('text', 'textarea', 'date');

-- AlterTable
ALTER TABLE "checklists"
  ADD COLUMN "context_fields" JSONB,
  ADD COLUMN "default_location_capture_policy" "ChecklistGeolocationPolicy",
  ADD COLUMN "pre_session_visibility" "ChecklistPreSessionVisibility" NOT NULL DEFAULT 'structure_only';

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN "group_id" UUID;

-- CreateTable
CREATE TABLE "checklist_item_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_item_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_item_groups_organization_id_idx" ON "checklist_item_groups"("organization_id");

-- CreateIndex
CREATE INDEX "checklist_item_groups_checklist_id_order_idx" ON "checklist_item_groups"("checklist_id", "order");

-- CreateIndex
CREATE INDEX "checklist_items_group_id_idx" ON "checklist_items"("group_id");

-- AddForeignKey
ALTER TABLE "checklist_item_groups" ADD CONSTRAINT "checklist_item_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_groups" ADD CONSTRAINT "checklist_item_groups_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "checklist_item_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
