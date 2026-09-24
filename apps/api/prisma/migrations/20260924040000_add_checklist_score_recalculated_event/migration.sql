-- PR 300: Admin session report + auditable recalculate -- adds the `score_recalculated`
-- ChecklistSessionEvent type recorded alongside every ChecklistScoreRevision (the revisions
-- table itself already exists, created by 20260922180000_add_checklist_session_domain).
-- Hand-written (not `prisma migrate dev`, non-interactive in this sandbox), mirroring PR 297's
-- `feedback_updated` migration. Additive/backward-compatible only: a new enum value, no existing
-- row, query, or snapshot is invalidated.

-- AlterEnum
ALTER TYPE "ChecklistSessionEventType" ADD VALUE 'score_recalculated';
