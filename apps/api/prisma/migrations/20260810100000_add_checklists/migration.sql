-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ChecklistScoringMode" AS ENUM ('sum_points', 'all_required', 'scale');

-- CreateEnum
CREATE TYPE "ChecklistInstanceStatus" AS ENUM ('assigned', 'in_progress', 'submitted', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "ChecklistReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'draft',
    "scoring_mode" "ChecklistScoringMode" NOT NULL DEFAULT 'sum_points',
    "pass_threshold" INTEGER NOT NULL DEFAULT 80,
    "scale_levels" JSONB,
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "photo_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_instances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by" UUID,
    "status" "ChecklistInstanceStatus" NOT NULL DEFAULT 'assigned',
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "due_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "checklist_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_item_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "scale_level" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "photo_url" TEXT,
    "comment" TEXT,
    "review_status" "ChecklistReviewStatus" NOT NULL DEFAULT 'pending',
    "review_comment" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_item_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklists_organization_id_status_idx" ON "checklists"("organization_id", "status");

-- CreateIndex
CREATE INDEX "checklist_items_organization_id_idx" ON "checklist_items"("organization_id");

-- CreateIndex
CREATE INDEX "checklist_items_checklist_id_order_idx" ON "checklist_items"("checklist_id", "order");

-- CreateIndex
CREATE INDEX "checklist_instances_organization_id_status_idx" ON "checklist_instances"("organization_id", "status");

-- CreateIndex
CREATE INDEX "checklist_instances_checklist_id_status_idx" ON "checklist_instances"("checklist_id", "status");

-- CreateIndex
CREATE INDEX "checklist_instances_user_id_idx" ON "checklist_instances"("user_id");

-- CreateIndex
CREATE INDEX "checklist_item_results_organization_id_idx" ON "checklist_item_results"("organization_id");

-- CreateIndex
CREATE INDEX "checklist_item_results_instance_id_idx" ON "checklist_item_results"("instance_id");

-- CreateIndex
CREATE INDEX "checklist_item_results_item_id_idx" ON "checklist_item_results"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_item_results_instance_id_item_id_key" ON "checklist_item_results"("instance_id", "item_id");

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
