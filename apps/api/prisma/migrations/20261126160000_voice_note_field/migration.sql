-- PR 512: voice recordings of the session's closing texts. A `summary` recording says which text it belongs to.
-- Additive: existing rows (comments of answers) keep a NULL field.
ALTER TABLE "checklist_voice_notes" ADD COLUMN "field" TEXT;
DROP INDEX IF EXISTS "checklist_voice_notes_instance_id_item_id_place_created_at_idx";
CREATE INDEX "checklist_voice_notes_instance_id_item_id_place_field_created_at_idx" ON "checklist_voice_notes"("instance_id", "item_id", "place", "field", "created_at");
