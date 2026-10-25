-- AlterEnum
ALTER TYPE "ChecklistSessionEventType" ADD VALUE 'deleted';
ALTER TYPE "ChecklistSessionEventType" ADD VALUE 'message_sent';

-- AlterTable
ALTER TABLE "checklist_sessions" ADD COLUMN "deleted_at" TIMESTAMPTZ;
