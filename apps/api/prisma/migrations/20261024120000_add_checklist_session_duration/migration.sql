ALTER TABLE "checklist_sessions"
ADD COLUMN "duration_minutes" INTEGER,
ADD CONSTRAINT "checklist_sessions_duration_minutes_check"
CHECK ("duration_minutes" BETWEEN 1 AND 1440);
