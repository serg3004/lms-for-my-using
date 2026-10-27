-- PR 355: optional checklist cover image (private storage key, public timestamp only).
ALTER TABLE "checklists" ADD COLUMN "cover_object_key" TEXT;
ALTER TABLE "checklists" ADD COLUMN "cover_mime_type" TEXT;
ALTER TABLE "checklists" ADD COLUMN "cover_updated_at" TIMESTAMPTZ;
