-- Support ReportsService.getSummary()'s bounded, ordered queries at scale:
-- progress is listed most-recent-first by updatedAt, and overdue assignments are
-- filtered by status + dueAt within an organization.
CREATE INDEX "progress_organization_id_updated_at_idx"
  ON "progress"("organization_id", "updated_at");
CREATE INDEX "assignments_organization_id_status_due_at_idx"
  ON "assignments"("organization_id", "status", "due_at");
