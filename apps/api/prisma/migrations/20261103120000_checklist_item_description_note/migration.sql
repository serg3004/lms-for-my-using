-- PR 415: per-criterion description (hint) and conditional explanation rule.
-- Additive only: every existing criterion keeps the description off and the explanation rule "off",
-- so no existing sheet, assignment or snapshot changes behaviour.

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN "description" TEXT,
ADD COLUMN "description_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "note_rule" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN "note_answers" JSONB,
ADD COLUMN "note_required" BOOLEAN NOT NULL DEFAULT false;
