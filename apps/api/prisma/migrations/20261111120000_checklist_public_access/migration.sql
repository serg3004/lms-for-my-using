-- PR 464: entry to a free checklist by a permanent link / QR code (settings and the guest name of a pass).
CREATE TYPE "ChecklistPublicAccess" AS ENUM ('off', 'registered', 'everyone');
ALTER TABLE "checklists" ADD COLUMN "public_access" "ChecklistPublicAccess" NOT NULL DEFAULT 'off';
ALTER TABLE "checklists" ADD COLUMN "public_token" TEXT;
ALTER TABLE "checklists" ADD COLUMN "guest_name_required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "checklists" ADD COLUMN "guest_photos_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "checklists" ADD COLUMN "public_access_changed_at" TIMESTAMPTZ;
ALTER TABLE "checklists" ADD COLUMN "public_access_changed_by" UUID;
CREATE UNIQUE INDEX "checklists_public_token_key" ON "checklists"("public_token");
ALTER TABLE "checklist_instances" ADD COLUMN "guest_name" TEXT;
