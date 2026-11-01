-- PR 397: per-sheet overrides of the organization module settings (additive). Null / empty = "as in the organization".
ALTER TABLE "checklists"
  ADD COLUMN "high_threshold_override" INTEGER,
  ADD COLUMN "low_threshold_override" INTEGER,
  ADD COLUMN "result_color_low_override" TEXT,
  ADD COLUMN "result_color_mid_override" TEXT,
  ADD COLUMN "result_color_high_override" TEXT,
  ADD COLUMN "feedback_visibility_override" "ChecklistFeedbackVisibility",
  ADD COLUMN "observer_eligibility_override" "ChecklistObserverEligibility",
  ADD COLUMN "observer_roles_override" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
  ADD COLUMN "observer_user_ids_override" UUID[] DEFAULT ARRAY[]::UUID[];

-- Thresholds and result colours frozen when an instance completes.
ALTER TABLE "checklist_instances" ADD COLUMN "report_settings" JSONB;
