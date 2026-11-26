-- PR 511: what an organization allows in checklist comments and how a checklist refines it. Additive only.
-- Existing organizations get dictation on and voice recording off; an administrator turns voice on.
CREATE TYPE "checklist_input_mode" AS ENUM ('inherit', 'on', 'off');

ALTER TABLE "organizations"
  ADD COLUMN "dictation_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "voice_notes_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "voice_note_max_seconds" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "voice_notes_per_comment" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "voice_settings_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "checklists"
  ADD COLUMN "dictation_mode" "checklist_input_mode" NOT NULL DEFAULT 'inherit',
  ADD COLUMN "voice_notes_mode" "checklist_input_mode" NOT NULL DEFAULT 'inherit';
