CREATE INDEX "checklist_instances_status_due_at_organization_id_idx"
ON "checklist_instances"("status", "due_at", "organization_id");
