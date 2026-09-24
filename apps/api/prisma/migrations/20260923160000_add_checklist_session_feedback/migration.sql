-- PR 297: Observer mobile-first conduct screen -- structured feedback (strengths/development
-- areas/next steps) on ChecklistSession, plus the `feedback_updated` audit event type.
-- Hand-written (not `prisma migrate dev`, non-interactive in this sandbox) and isolated via
-- `prisma migrate diff --shadow-database-url <fresh db>` from unrelated pre-existing
-- schema.prisma/migration-history drift already present on main (same drift PR 293/296 documented).
-- Additive/backward-compatible only: new nullable columns and a new enum value -- no existing
-- row, query, or snapshot is invalidated.

-- AlterEnum
ALTER TYPE "ChecklistSessionEventType" ADD VALUE 'feedback_updated';

-- AlterTable
ALTER TABLE "checklist_sessions"
  ADD COLUMN "strengths" TEXT,
  ADD COLUMN "development_areas" TEXT,
  ADD COLUMN "next_steps" TEXT;
