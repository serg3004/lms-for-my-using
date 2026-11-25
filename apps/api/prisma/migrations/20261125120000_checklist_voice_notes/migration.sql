-- PR 509: voice recordings attached to comments of a check (additive). A check without rows simply has no recordings.
CREATE TYPE "ChecklistVoiceNotePlace" AS ENUM ('answer', 'reviewer_comment', 'summary');

CREATE TABLE "checklist_voice_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "item_id" UUID,
    "place" "ChecklistVoiceNotePlace" NOT NULL DEFAULT 'answer',
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_voice_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_voice_notes_instance_id_item_id_place_created_at_idx" ON "checklist_voice_notes"("instance_id", "item_id", "place", "created_at");
CREATE INDEX "checklist_voice_notes_organization_id_idx" ON "checklist_voice_notes"("organization_id");

ALTER TABLE "checklist_voice_notes" ADD CONSTRAINT "checklist_voice_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_voice_notes" ADD CONSTRAINT "checklist_voice_notes_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_voice_notes" ADD CONSTRAINT "checklist_voice_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
