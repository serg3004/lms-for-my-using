-- PR 457: default explanation rule of an evaluation scale (copied into a criterion that has no rule of its own).
ALTER TABLE "checklist_scales" ADD COLUMN "note_rule" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "checklist_scales" ADD COLUMN "note_answers" JSONB;
ALTER TABLE "checklist_scales" ADD COLUMN "note_required" BOOLEAN NOT NULL DEFAULT false;
