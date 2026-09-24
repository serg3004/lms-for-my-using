-- AlterTable
ALTER TABLE "checklist_sessions" ADD COLUMN "observer_unavailable_reason" TEXT;
ALTER TABLE "checklist_sessions" ADD COLUMN "observer_unavailable_at" TIMESTAMPTZ;
