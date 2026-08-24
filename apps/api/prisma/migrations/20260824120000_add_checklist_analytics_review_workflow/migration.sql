CREATE TYPE "ChecklistInstanceEventType" AS ENUM ('assigned', 'started', 'item_answered', 'photo_attached', 'submitted', 'reviewer_assigned', 'item_approved', 'item_rejected', 'completed', 'expired');

ALTER TABLE "checklist_instances"
  ADD COLUMN "reviewer_id" UUID,
  ADD COLUMN "review_assigned_at" TIMESTAMPTZ,
  ADD COLUMN "review_assigned_by" UUID;

ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_review_assigned_by_fkey" FOREIGN KEY ("review_assigned_by") REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX "checklist_instances_organization_id_reviewer_id_status_idx" ON "checklist_instances"("organization_id", "reviewer_id", "status");
CREATE INDEX "checklist_instances_organization_id_submitted_at_idx" ON "checklist_instances"("organization_id", "submitted_at");
CREATE INDEX "checklist_instances_organization_id_completed_at_idx" ON "checklist_instances"("organization_id", "completed_at");

CREATE TABLE "checklist_instance_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL,
  "instance_id" UUID NOT NULL, "event_type" "ChecklistInstanceEventType" NOT NULL,
  "actor_user_id" UUID, "item_id" UUID, "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "checklist_instance_events_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "checklist_instance_events" ADD CONSTRAINT "checklist_instance_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "checklist_instance_events" ADD CONSTRAINT "checklist_instance_events_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE;
ALTER TABLE "checklist_instance_events" ADD CONSTRAINT "checklist_instance_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX "checklist_instance_events_instance_id_created_at_id_idx" ON "checklist_instance_events"("instance_id", "created_at", "id");
CREATE INDEX "checklist_instance_events_organization_id_created_at_idx" ON "checklist_instance_events"("organization_id", "created_at");
