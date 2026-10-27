-- PR 353: checklist access mode (assigned | free). Additive: every existing checklist stays `assigned`.
CREATE TYPE "ChecklistAccessMode" AS ENUM ('assigned', 'free');

ALTER TABLE "checklists"
  ADD COLUMN "access_mode" "ChecklistAccessMode" NOT NULL DEFAULT 'assigned';

CREATE INDEX "checklists_organization_id_access_mode_status_idx"
  ON "checklists" ("organization_id", "access_mode", "status");
