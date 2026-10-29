-- PR 369b: owner-chosen highlight colours (#RRGGBB). NULL keeps the built-in defaults, so existing
-- scales and settings behave as before.
ALTER TABLE "checklist_scale_levels" ADD COLUMN "color" TEXT;
ALTER TABLE "checklist_workplace_settings" ADD COLUMN "result_color_low" TEXT;
ALTER TABLE "checklist_workplace_settings" ADD COLUMN "result_color_mid" TEXT;
ALTER TABLE "checklist_workplace_settings" ADD COLUMN "result_color_high" TEXT;
