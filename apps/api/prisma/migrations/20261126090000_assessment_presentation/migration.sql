ALTER TABLE "assessments" ADD COLUMN "presentation" JSONB;
ALTER TABLE "organizations" ADD COLUMN "assessment_theme" JSONB;

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_title_screen_timer_check"
  CHECK ("time_limit_minutes" IS NULL OR ("presentation" ->> 'titleScreen') IS DISTINCT FROM 'false');
