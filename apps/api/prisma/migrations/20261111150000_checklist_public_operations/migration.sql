-- PR 465: daily limit of guest passes per sheet and the event that marks a guest pass whose link was switched off or reissued.
ALTER TABLE "checklists" ADD COLUMN "public_daily_limit" INTEGER NOT NULL DEFAULT 200;
ALTER TYPE "ChecklistInstanceEventType" ADD VALUE 'guest_link_disabled';
