-- Composite indexes match tenant predicates and stable list ordering.
CREATE INDEX "users_organization_id_created_at_id_idx"
  ON "users"("organization_id", "created_at", "id");
CREATE INDEX "courses_organization_id_created_at_id_idx"
  ON "courses"("organization_id", "created_at", "id");
CREATE INDEX "lessons_organization_id_created_at_id_idx"
  ON "lessons"("organization_id", "created_at", "id");
CREATE INDEX "assignments_organization_id_created_at_id_idx"
  ON "assignments"("organization_id", "created_at", "id");
CREATE INDEX "progress_organization_id_created_at_id_idx"
  ON "progress"("organization_id", "created_at", "id");
CREATE INDEX "assessments_organization_id_created_at_id_idx"
  ON "assessments"("organization_id", "created_at", "id");
CREATE INDEX "certificates_organization_id_issued_at_id_idx"
  ON "certificates"("organization_id", "issued_at", "id");

DROP INDEX "notifications_organization_id_user_id_created_at_idx";
CREATE INDEX "notifications_organization_id_user_id_created_at_id_idx"
  ON "notifications"("organization_id", "user_id", "created_at", "id");
